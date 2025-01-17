import { packageRemove as pkgRemove } from "@dappnode/installer";
/**
 * Remove package data: docker down + disk files
 *
 * @param id DNP .eth name
 * @param deleteVolumes flag to also clear permanent package data
 */
export async function packageRemove({
  dnpName,
  deleteVolumes = false
}: {
  dnpName: string;
  deleteVolumes?: boolean;
}): Promise<void> {
  await pkgRemove({ dnpName, deleteVolumes });
}
