const { eventBus, eventBusTag } = require("eventBus");
const logs = require("logs.js")(module);
const db = require("db");
// Modules
const packages = require("modules/packages");
const dappGet = require("modules/dappGet");
const dappGetBasic = require("modules/dappGet/basic");
const getManifest = require("modules/getManifest");
const lockPorts = require("modules/lockPorts");
// Utils
const logUi = require("utils/logUi");
const parse = require("utils/parse");
const merge = require("utils/merge");
const isIpfsRequest = require("utils/isIpfsRequest");
const isSyncing = require("utils/isSyncing");
const envsHelper = require("utils/envsHelper");
const parseManifestPorts = require("utils/parseManifestPorts");

/**
 * Installs a package. It resolves dependencies, downloads
 * manifests and images, loads the images to docker, and calls
 * docker up on each package.
 * It has extra functionality for special cases
 * - allowCore: If a manifest requests a package to be core
 *   it will only be granted if
 *   1. Its manifest comes from APM and .dnp.dappnode.eth
 *   2. It comes from IPFS and the BYPASS_CORE_RESTRICTION env is true
 * - Special versions: It needs to deal with two cases
 *   1. ver = 'latest'
 *   2. ver = '/ipfs/QmZ87fb2...'
 *
 * @param {Object} kwargs = {
 *   id: package .eth name {String}
 *   userSetEnvs: {
 *     "kovan.dnp.dappnode.eth": {
 *       "ENV_NAME": "VALUE1"
 *     }, ... }
 *   userSetVols: user set volumes {Object} = {
 *     "kovan.dnp.dappnode.eth": {
 *       "kovan:/root/.local/share/io.parity.ethereum/": "different_name"
 *     }, ... }
 *   userSetPorts: user set ports {Object} = {
 *     "kovan.dnp.dappnode.eth": {
 *       "30303": "31313:30303",
 *       "30303/udp": "31313:30303/udp"
 *     }, ... }
 *   options: {
 *     BYPASS_RESOLVER: true,
 *     ...
 *   }
 * }
 * @return {Object} A formated success message.
 * result: empty
 */
const installPackage = async ({
  id,
  userSetEnvs = {},
  userSetVols = {},
  userSetPorts = {},
  options = {}
}) => {
  if (!id) throw Error("kwarg id must be defined");

  /**
   * The logId is the requested id.
   * - Doesn't require the generation of a random number
   * - Two install calls of the same DNP will be bundled in the userActionLogs
   * - The progressLogs in the UI will know which DNP triggered them
   */

  // 1. Parse the id into a request
  // id = 'otpweb.dnp.dappnode.eth@0.1.4'
  // req = { name: 'otpweb.dnp.dappnode.eth', ver: '0.1.4' }
  const req = parse.packageReq(id);

  // If the request is not from IPFS, check if the chain is syncing
  if (!isIpfsRequest(req) && (await isSyncing())) {
    throw Error("Mainnet is syncing");
  }

  // 2. Resolve the request
  // result = {
  //     success: {'bind.dnp.dappnode.eth': '0.1.4'}
  //     alreadyUpdated: {'bind.dnp.dappnode.eth': '0.1.2'}
  // }
  logUi({ id, name: req.name, message: "Resolving dependencies..." });
  const result = options.BYPASS_RESOLVER
    ? await dappGetBasic(req)
    : await dappGet(req);
  if (!result.success) {
    throw Error(
      `Request ${req.name}@${req.ver} could not be resolved: ${result.message}`
    );
  }
  logs.debug(
    `Successfully resolved request ${JSON.stringify(req)}:\n ${JSON.stringify(
      result,
      null,
      2
    )}`
  );

  // 3. Format the request and filter out already updated packages
  Object.keys(result.alreadyUpdated || {}).forEach(name => {
    logUi({ id, name, message: "Already updated" });
  });

  let pkgs = await Promise.all(
    Object.keys(result.success).map(async name => {
      // 3.2 Fetch manifest
      const ver = result.success[name];
      let manifest = await getManifest({ name, ver });
      if (!manifest) throw Error("Missing manifest for " + name);

      // 3.3 Verify dncore condition
      // Prevent default values. Someone can try to spoof "isCore" in the manifest
      // The origin must be the registry controlled by the DAppNode team, and it must NOT come from ipfs, thus APM
      if (manifest.type == "dncore") {
        if (
          !options.BYPASS_CORE_RESTRICTION &&
          (!name.endsWith(".dnp.dappnode.eth") || ver.startsWith("/ipfs/"))
        ) {
          throw Error(
            `Unverified core package ${name}, only allowed origin is .dnp.dappnode.eth APM registy`
          );
        }
        manifest.isCore = true;
      }

      // 3.4 Merge user set vols and ports
      manifest = merge.manifest.vols(manifest, userSetVols);
      manifest = merge.manifest.ports(manifest, userSetPorts);

      // Return pkg object
      return { name, ver, manifest };
    })
  );
  logs.debug(
    `Processed manifests for: ${pkgs.map(({ name }) => name).join(", ")}`
  );

  // 4. Download requested packages in paralel
  await Promise.all(pkgs.map(pkg => packages.download({ pkg, id })));
  logs.info(
    `Successfully downloaded DNPs ${pkgs.map(({ name }) => name).join(", ")}`
  );

  // Patch, install the dappmanager the last always
  const isDappmanager = pkg =>
    (pkg.manifest.name || "").includes("dappmanager.dnp.dappnode.eth");
  for (const pkg of pkgs.sort(pkg => (isDappmanager(pkg) ? 1 : -1))) {
    // 5. Set ENVs. Set userSetEnvs + the manifest defaults (if not previously set)
    const { name, isCore } = pkg.manifest;
    const defaultEnvs = envsHelper.getManifestEnvs(pkg.manifest) || {};
    const previousEnvs = envsHelper.load(name, isCore) || {};
    const _userSetEnvs = userSetEnvs[pkg.manifest.name] || {};
    /**
     * Merge ENVs by priority
     * 1. userSet on installation
     * 2. previously set (already installed DNPs)
     * 3. default values from the manifest
     * Empty values will NOT be replaced on updates. If values DO need to be replaced use:
     *   envs = require("utils/merge").envs(defaultEnvs, previousEnvs, userSetEnvs)
     */
    const envs = { ...defaultEnvs, ...previousEnvs, ..._userSetEnvs };
    envsHelper.write(name, isCore, envs);
    logs.info(
      `Wrote envs for DNP ${name} ${isCore ? "(Core)" : ""}:\n ${JSON.stringify(
        envs,
        null,
        2
      )}`
    );

    // 6. Run requested packages
    await packages.run({ pkg, id });
    logs.debug(`Started (docker-compose up) DNP ${pkg.name}`);

    // 7. Open ports
    // 7A. Mapped ports: mappedPortsToOpen = [ {number: '30303', type: 'TCP'}, ... ]
    const mappedPortsToOpen = parseManifestPorts(pkg.manifest);

    // 7B. P2P ports: modify docker-compose + open ports
    // - lockPorts modifies the docker-compose and returns
    //   lockedPortsToOpen = [ {number: '32769', type: 'UDP'}, ... ]
    // - managePorts calls UPnP to open the ports
    const lockedPortsToOpen = await lockPorts({ pkg });
    if (lockedPortsToOpen.length)
      logs.info(
        `Locked ${lockedPortsToOpen.length} ports of DNP ${
          pkg.name
        }: ${JSON.stringify(lockedPortsToOpen)}`
      );

    // Skip if there are no ports to open or if UPnP is not available
    const portsToOpen = [...mappedPortsToOpen, ...lockedPortsToOpen];
    const upnpAvailable = await db.get("upnpAvailable");
    if (portsToOpen.length && upnpAvailable) {
      eventBus.emit(eventBusTag.call, {
        callId: "managePorts",
        kwargs: {
          action: "open",
          ports: portsToOpen
        }
      });
      logs.debug(
        `Emitted internal call to open ports: ${JSON.stringify(portsToOpen)}`
      );
    }
  }

  // Emit packages update
  eventBus.emit(eventBusTag.emitPackages);
  eventBus.emit(eventBusTag.packageModified);

  return {
    message: "Installed " + req.req,
    logMessage: true,
    userAction: true
  };
};

module.exports = installPackage;
