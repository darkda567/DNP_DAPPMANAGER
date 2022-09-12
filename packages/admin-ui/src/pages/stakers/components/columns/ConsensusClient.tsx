import React from "react";
import Card from "components/Card";
import { prettyDnpName } from "utils/format";
import { InputForm } from "components/InputForm";
import { joinCssClass } from "utils/css";
import { ConsensusClient as ConsensusClientIface } from "types";
import "./columns.scss";

export default function ConsensusClient({
  consensusClient,
  setNewConsClient,
  newConsClient,
  isSelected,
  feeRecipientError,
  graffitiError,
  checkpointSyncPlaceHolder
}: {
  consensusClient: ConsensusClientIface;
  setNewConsClient: React.Dispatch<
    React.SetStateAction<ConsensusClientIface | undefined>
  >;
  newConsClient: ConsensusClientIface | undefined;
  isSelected: boolean;
  feeRecipientError: string | null;
  graffitiError: string | null;
  checkpointSyncPlaceHolder: string;
}) {
  return (
    <Card
      className={`consensus-client ${joinCssClass({ isSelected })}`}
      shadow={isSelected}
    >
      <div
        className="title"
        onClick={
          isSelected
            ? () => setNewConsClient({ dnpName: "" })
            : () => setNewConsClient(consensusClient)
        }
      >
        {prettyDnpName(consensusClient.dnpName)}
      </div>
      {isSelected && newConsClient && (
        <>
          <hr />
          <InputForm
            fields={[
              {
                label: "Fee recipient address",
                labelId: "fee-recipient-address",
                name: "fee-recipient-address",
                autoComplete: "fee-recipient-address",
                secret: false,
                value: newConsClient.feeRecipient || "",
                onValueChange: (value: string) =>
                  setNewConsClient({ ...newConsClient, feeRecipient: value }),
                error: feeRecipientError
              },
              {
                label: "Graffiti",
                labelId: "graffiti",
                name: "graffiti",
                autoComplete: "validating_from_DAppNode",
                secret: false,
                value: newConsClient.graffiti || "",
                onValueChange: (value: string) =>
                  setNewConsClient({ ...newConsClient, graffiti: value }),
                error: graffitiError
              },
              {
                label: "Checkpoint sync",
                labelId: "checkpoint-sync",
                name: "checkpoint-sync",
                autoComplete: "checkpoint-sync",
                placeholder: checkpointSyncPlaceHolder,
                secret: false,
                value: newConsClient.checkpointSync || "",
                onValueChange: (value: string) =>
                  setNewConsClient({
                    ...newConsClient,
                    checkpointSync: value
                  }),
                error: null
              }
            ]}
          />
        </>
      )}
    </Card>
  );
}