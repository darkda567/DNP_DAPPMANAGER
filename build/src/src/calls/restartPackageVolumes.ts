import fs from "fs";
import { uniq } from "lodash";
import params from "../params";
import {
  dockerComposeRm,
  dockerVolumeRm
} from "../modules/docker/dockerCommands";
import { dockerComposeUpSafe } from "../modules/docker/dockerSafe";
import { listContainerExtendedInfo } from "../modules/docker/listContainers";
import * as eventBus from "../eventBus";
// Utils
import * as getPath from "../utils/getPath";
import { RpcHandlerReturn } from "../types";
import Logs from "../logs";
const logs = Logs(module);

/**
 * Removes a package volumes. The re-ups the package
 *
 * @param {string} id DNP .eth name
 */
export default async function restartPackageVolumes({
  id,
  doNotRestart,
  volumeId
}: {
  id: string;
  doNotRestart?: boolean;
  volumeId?: string;
}): Promise<RpcHandlerReturn> {
  if (!id) throw Error("kwarg id must be defined");

  // Needs the extended info that includes the volume ownership data
  const dnp = await listContainerExtendedInfo(id);

  /**
   * @param {object} namedOwnedVolumes = {
   *   names: [
   *     "nginxproxydnpdappnodeeth_html",
   *     "1f6ceacbdb011451622aa4a5904309765dc2bfb0f4affe163f4e22cba4f7725b",
   *     "nginxproxydnpdappnodeeth_vhost.d"
   *   ],
   *   dnpsToRemove: [
   *     "letsencrypt-nginx.dnp.dappnode.eth",
   *     "nginx-proxy.dnp.dappnode.eth"
   *   ]
   * }
   */
  const namedOwnedVolumes = (dnp.volumes || []).filter(
    vol => vol.name && vol.isOwner && (!volumeId || volumeId === vol.name)
  );
  // If there are no volumes don't do anything
  if (!namedOwnedVolumes.length)
    if (volumeId) throw Error(`Volume ${volumeId} of ${id} not found`);
    else
      return {
        message: `${id} has no named volumes`,
        logMessage: true,
        userAction: true
      };

  // Destructure result and append the current requested DNP (id)
  const volumeNames = namedOwnedVolumes.map(vol => vol.name);
  const dnpsToRemove = namedOwnedVolumes
    .reduce((dnps: string[], vol) => uniq([...dnps, ...(vol.users || [])]), [])
    /**
     * It is critical up packages in the correct order,
     * so that the named volumes are created before the users are started
     * [NOTE] the next sort function is a simplified solution, where the
     * id will always be the owner of the volumes, and other DNPs, the users.
     */
    .sort((dnpName: string) => (dnpName === id ? -1 : 1));

  logs.debug(JSON.stringify({ volumeNames, dnpsToRemove }, null, 2));

  // Verify results
  const dockerComposePaths: { [dnpName: string]: string } = {};

  /**
   * Load docker-compose paths and verify results
   * - All docker-compose must exist
   * - No DNP can be the "dappmanager.dnp.dappnode.eth"
   */
  for (const dnpName of dnpsToRemove) {
    if (dnpName.includes("dappmanager.dnp.dappnode.eth")) {
      throw Error("The dappmanager cannot be restarted");
    }
    const dockerComposePath = getPath.dockerComposeSmart(dnpName, params);
    if (!fs.existsSync(dockerComposePath)) {
      throw Error(`No docker-compose found: ${dockerComposePath}`);
    }
    dockerComposePaths[dnpName] = dockerComposePath;
  }

  let err;
  try {
    for (const dnpName of dnpsToRemove) {
      await dockerComposeRm(dockerComposePaths[dnpName]);
    }
    for (const volName of volumeNames) {
      if (volName) await dockerVolumeRm(volName);
    }
  } catch (e) {
    err = e;
  }
  // Restart docker to apply changes
  // Offer a doNotRestart option for the removePackage call
  if (doNotRestart) {
    logs.warn(`On restartPackageVolumes, doNotRestart = true`);
  } else {
    for (const dnpName of dnpsToRemove) {
      await dockerComposeUpSafe(dockerComposePaths[dnpName]);
    }
  }

  // In case of error: FIRST up the dnp, THEN throw the error
  if (err) throw err;

  // Emit packages update
  eventBus.requestPackages.emit();

  return {
    message: `Restarted ${id} volumes: ${volumeNames.join(" ")}`,
    logMessage: true,
    userAction: true
  };
}