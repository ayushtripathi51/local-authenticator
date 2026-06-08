import { Check, Copy, Pencil, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { TotpAccount } from "../lib/accounts";
import { CountdownRing } from "./CountdownRing";
import { IconButton } from "./IconButton";

type AccountCardProps = {
  account: TotpAccount;
  code: string;
  seconds: number;
  progress: number;
  copied: boolean;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

export function AccountCard({
  account,
  code,
  seconds,
  progress,
  copied,
  onCopy,
  onEdit,
  onDelete
}: AccountCardProps) {
  const [confirming, setConfirming] = useState(false);
  const groupedCode = code.length > 3 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;

  return (
    <article className="account-card">
      <div className="account-card__main">
        <button className="account-card__code" type="button" onClick={onCopy}>
          {groupedCode}
        </button>
        <div className="account-card__identity">
          <span className="account-card__issuer">{account.issuer || "Authenticator"}</span>
          <span className="account-card__label">{account.label}</span>
        </div>
      </div>

      <div className="account-card__tools">
        <CountdownRing seconds={seconds} progress={progress} />
        <IconButton label={copied ? "Copied" : "Copy code"} onClick={onCopy}>
          {copied ? <Check size={18} /> : <Copy size={18} />}
        </IconButton>
        <IconButton label="Edit account" onClick={onEdit}>
          <Pencil size={18} />
        </IconButton>
        {confirming ? (
          <>
            <IconButton label="Cancel delete" onClick={() => setConfirming(false)}>
              <X size={18} />
            </IconButton>
            <IconButton label="Confirm delete" variant="danger" onClick={onDelete}>
              <Trash2 size={18} />
            </IconButton>
          </>
        ) : (
          <IconButton label="Delete account" onClick={() => setConfirming(true)}>
            <Trash2 size={18} />
          </IconButton>
        )}
      </div>
    </article>
  );
}
