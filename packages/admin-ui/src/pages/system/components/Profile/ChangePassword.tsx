import React, { useState } from "react";
import Button from "components/Button";
import ErrorView from "components/ErrorView";
import { fetchChangePass, fetchLogout } from "api/auth";
import { ReqStatus } from "types";
import Ok from "components/Ok";
import {
  validatePasswordsMatch,
  validateStrongPassword
} from "utils/validation";
import { InputForm } from "components/InputForm";

export function ChangePassword() {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [reqStatus, setReqStatus] = useState<ReqStatus>({});

  const passwordError = validateStrongPassword(newPassword);
  const password2Error = validatePasswordsMatch(newPassword, newPassword2);
  const isValid =
    oldPassword &&
    newPassword &&
    newPassword2 &&
    !passwordError &&
    !password2Error;

  async function onChangePassword() {
    if (isValid)
      try {
        setReqStatus({ loading: true });
        await fetchChangePass({
          password: oldPassword,
          newPassword
        });
        setReqStatus({ result: true });

        // Logout so user re-enters the password
        await fetchLogout();
      } catch (e) {
        setReqStatus({ error: e });
      }
  }

  return (
    <>
      <InputForm
        fields={[
          {
            label: "Current password",
            labelId: "current-password",
            secret: true,
            value: oldPassword,
            onValueChange: setOldPassword
          },
          {
            label: "New password",
            labelId: "new-password",
            secret: true,
            value: newPassword,
            onValueChange: setNewPassword,
            error: passwordError
          },
          {
            label: "Confirm new password",
            labelId: "confirm-new-password",
            secret: true,
            value: newPassword2,
            onValueChange: setNewPassword2,
            error: password2Error
          }
        ]}
      />

      <Button
        onClick={onChangePassword}
        variant="dappnode"
        disabled={reqStatus.loading || !isValid}
      >
        Change UI password
      </Button>

      {reqStatus.result && <Ok ok msg={"Changed password"}></Ok>}
      {reqStatus.error && <ErrorView error={reqStatus.error} hideIcon red />}
    </>
  );
}
