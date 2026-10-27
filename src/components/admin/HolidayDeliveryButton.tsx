"use client";

import { useFormState, useFormStatus } from "react-dom";
import { deliverHolidayOrder } from "@/app/admin/holidays/actions";

export default function HolidayDeliveryButton({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const [state, action] = useFormState(deliverHolidayOrder, {
    error: null,
    saved: false,
  });
  const next = status === 'packed' ? 'delivered' : 'packed';
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (
          !window.confirm(
            next === "packed" ? "Mark this order packed?" : "Mark this fully paid order delivered or collected? No additional payment will be taken.",
          )
        )
          event.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={next} />
      <Button next={next} />
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

function Button({ next }: { next: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="admin-primary-button disabled:opacity-50"
    >
      {pending
        ? "Processing…"
        : next === "packed" ? "Mark as Packed" : "Mark as Delivered / collected"}
    </button>
  );
}
