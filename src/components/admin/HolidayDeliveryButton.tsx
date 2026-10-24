"use client";

import { useFormState, useFormStatus } from "react-dom";
import { deliverHolidayOrder } from "@/app/admin/holidays/actions";

export default function HolidayDeliveryButton({
  id,
}: {
  id: string;
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
            "Mark this fully paid order delivered or collected? No additional payment will be taken.",
          )
        )
          event.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Button />
      {state.error && (
        <p className="mt-3 text-sm text-brand-brick" role="alert">
          {state.error}
        </p>
      )}
      {state.saved && (
        <p className="mt-3 text-sm text-moss-700" role="status">
          Fulfillment recorded. No additional payment was taken.
        </p>
      )}
    </form>
  );
}

function Button() {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="admin-primary-button disabled:opacity-50"
    >
      {pending
        ? "Processing…"
        : "Mark delivered / collected"}
    </button>
  );
}
