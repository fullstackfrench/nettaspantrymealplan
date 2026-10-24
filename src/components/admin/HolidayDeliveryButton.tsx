"use client";

import { useFormState, useFormStatus } from "react-dom";
import { deliverHolidayOrder } from "@/app/admin/holidays/actions";
import { formatCents } from "@/lib/constants";

export default function HolidayDeliveryButton({
  id,
  balance,
  delivered,
}: {
  id: string;
  balance: number;
  delivered: boolean;
}) {
  const [state, action] = useFormState(deliverHolidayOrder, {
    error: null,
    saved: false,
  });
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (
          !window.confirm(
            delivered
              ? `Attempt the ${formatCents(balance)} balance payment on the existing invoice?`
              : `Mark this order delivered/collected and charge its ${formatCents(balance)} remaining balance?`,
          )
        )
          event.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Button delivered={delivered} />
      {state.error && (
        <p className="mt-3 text-sm text-brand-brick" role="alert">
          {state.error}
        </p>
      )}
      {state.saved && (
        <p className="mt-3 text-sm text-moss-700" role="status">
          Fulfillment recorded. See the invoice payment status below.
        </p>
      )}
    </form>
  );
}

function Button({ delivered }: { delivered: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="admin-primary-button disabled:opacity-50"
    >
      {pending
        ? "Processing…"
        : delivered
          ? "Retry balance payment"
          : "Mark delivered / collected & charge balance"}
    </button>
  );
}
