"use client";

import { useFormState, useFormStatus } from "react-dom";
import { saveHolidaySettings } from "@/app/admin/holidays/actions";
import type { HolidaySettings } from "@/lib/holiday-menu";

export default function HolidaySettingsForm({
  settings,
  installed,
}: {
  settings: HolidaySettings;
  installed: boolean;
}) {
  const [state, action] = useFormState(saveHolidaySettings, {
    error: null,
    saved: false,
  });
  return (
    <form action={action} className="admin-card p-6">
      <h2 className="font-display text-2xl font-bold text-brand-plum">
        Holiday pricing &amp; availability
      </h2>
      <p className="mt-3 text-sm leading-6 text-ink/65">
        Customers pay in full at checkout. Changes apply to new checkouts; existing
        orders keep their agreed prices. The minimum applies to the holiday package,
        before dessert extras and delivery.
      </p>
      <input type="hidden" name="version" value={settings.version} />
      <fieldset
        key={settings.version}
        disabled={!installed}
        className="mt-6 grid gap-5 sm:grid-cols-2"
      >
        <Field
          name="per_person"
          label="Package price per person ($)"
          value={(settings.per_person_cents / 100).toFixed(2)}
        />
        <Field
          name="minimum_order"
          label="Minimum holiday package ($)"
          value={(settings.minimum_order_cents / 100).toFixed(2)}
        />
        <Field
          name="minimum_people"
          label="Minimum people"
          value={String(settings.minimum_people)}
          type="number"
        />
        <Field
          name="extra_dessert"
          label="Second dessert price ($; blank disables extra)"
          value={
            settings.extra_dessert_cents === null
              ? ""
              : (settings.extra_dessert_cents / 100).toFixed(2)
          }
          required={false}
        />
        <label className="text-sm font-bold text-brand-plum">
          Second dessert price basis
          <select
            name="extra_dessert_basis"
            defaultValue={settings.extra_dessert_basis}
            className="admin-input mt-2"
          >
            <option value="person">Per person</option>
            <option value="order">Per order</option>
          </select>
        </label>
        <Field
          name="delivery_fee"
          label="Delivery fee per order ($)"
          value={(settings.delivery_fee_cents / 100).toFixed(2)}
        />
        <Field
          name="thanksgiving_deadline"
          label="Thanksgiving order deadline (Eastern time)"
          value={settings.thanksgiving_deadline}
          type="date"
        />
        <Field
          name="thanksgiving_fulfillment"
          label="Thanksgiving pickup/delivery date"
          value={settings.thanksgiving_fulfillment}
          type="date"
        />
        <Field
          name="christmas_deadline"
          label="Christmas order deadline (Eastern time)"
          value={settings.christmas_deadline}
          type="date"
        />
        <Field
          name="christmas_fulfillment"
          label="Christmas pickup/delivery date"
          value={settings.christmas_fulfillment}
          type="date"
        />
        <Field
          name="pickup_location"
          label="Pickup location (blank disables pickup)"
          value={settings.pickup_location}
          required={false}
        />
        <Field
          name="delivery_zips"
          label="Delivery ZIP codes (comma-separated)"
          value={settings.delivery_zips.join(", ")}
          required={false}
        />
        <label className="flex items-start gap-3 text-sm leading-6 text-ink/75 sm:col-span-2">
          <input
            type="checkbox"
            name="orders_open"
            defaultChecked={settings.orders_open}
            className="mt-1 h-5 w-5 accent-[#682952]"
          />
          <span>
            Open holiday ordering. Confirm pricing, fulfillment dates, pickup
            location, and delivery fees first.
          </span>
        </label>
      </fieldset>
      {!installed && (
        <p className="mt-5 text-sm text-brand-brick">
          Apply the holiday migration before saving settings or accepting
          orders.
        </p>
      )}
      {state.error && (
        <p className="mt-5 text-sm text-brand-brick" role="alert">
          {state.error}
        </p>
      )}
      {state.saved && (
        <p className="mt-5 text-sm text-moss-700" role="status">
          Holiday settings saved.
        </p>
      )}
      <SaveButton disabled={!installed} />
    </form>
  );
}

function Field({
  name,
  label,
  value,
  type = "text",
  required = true,
}: {
  name: string;
  label: string;
  value: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="text-sm font-bold text-brand-plum">
      {label}
      <input
        className="admin-input mt-2"
        name={name}
        defaultValue={value}
        type={type}
        required={required}
        maxLength={1000}
      />
    </label>
  );
}

function SaveButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      className="admin-primary-button mt-6 disabled:opacity-50"
      disabled={disabled || pending}
    >
      {pending ? "Saving…" : "Save holiday settings"}
    </button>
  );
}
