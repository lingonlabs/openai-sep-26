import {
  normalize,
  type Observation,
  type VendorCheck,
  type VendorReview,
  type VendorValues,
} from "@close/shared";

export function vendorReview(observation: Observation): VendorReview {
  const fields = observation.elements
    .filter(
      (e) =>
        e.value !== null &&
        !["button", "submit", "reset"].includes(e.inputType ?? "") &&
        !/search|filter/i.test(e.label),
    )
    .map((e) => ({
      id: e.id,
      label: e.label,
      value: e.value ?? "",
      displayValue:
        e.tag === "select"
          ? (e.options.find((o) => o.value === e.value)?.label ?? e.value ?? "")
          : (e.value ?? ""),
      required: e.required ?? false,
      checked: e.checked ?? null,
    }));
  return {
    documentId: observation.context.documentId,
    url: observation.context.url,
    fields,
    missing: fields
      .filter(
        (f) =>
          f.required &&
          (f.checked === false || (f.checked === null && !f.value.trim())),
      )
      .map((f) => f.label),
  };
}
export function verifyVendorIdentity(
  observation: Observation,
  values: VendorValues,
) {
  if (
    observation.context.app !== "netsuite" ||
    observation.context.workflow !== "vendor_form"
  )
    throw new Error(
      "VENDOR_FORM_REQUIRED: Open a new, unsaved company vendor form.",
    );
  const u = new URL(observation.context.url);
  if (
    !/\/vendor\.nl$/i.test(u.pathname) &&
    !u.pathname.startsWith("/demo/netsuite")
  )
    throw new Error(
      "VENDOR_FORM_REQUIRED: Vendor creation is restricted to a vendor record form.",
    );
  if (u.searchParams.has("id"))
    throw new Error(
      "EXISTING_VENDOR: An existing vendor must not be overwritten.",
    );
  const name = observation.elements.filter(
    (e) =>
      /^(company name|vendor name)$/i.test(e.label) &&
      e.value !== null &&
      !e.readOnly &&
      !e.disabled,
  );
  if (name.length !== 1)
    throw new Error(
      "UNSUPPORTED_VENDOR_FORM: Cannot identify a unique Company Name field.",
    );
  if (normalize(name[0].value ?? "") !== normalize(values.name))
    throw new Error(
      "VENDOR_CHANGED: The vendor name differs from the reviewed name.",
    );
  if (
    values.email &&
    !observation.elements.some(
      (e) =>
        /^e-?mail$/i.test(e.label) &&
        normalize(e.value ?? "") === normalize(values.email),
    )
  )
    throw new Error(
      "VENDOR_CHANGED: The email differs from the reviewed email.",
    );
}
export function checkVendorList(
  doc: Document,
  observation: Observation,
  name: string,
): VendorCheck {
  const incomplete = (reason: string): VendorCheck => ({
    name,
    complete: false,
    matches: [],
    reason,
  });
  if (observation.context.workflow !== "vendor_list")
    return incomplete("Open the NetSuite Vendors list first.");
  const visible = (el: Element) =>
    (el as HTMLElement).getClientRects().length > 0 &&
    doc.defaultView!.getComputedStyle(el).visibility !== "hidden";
  for (const table of Array.from(doc.querySelectorAll("table")).filter(
    visible,
  )) {
    const rows = Array.from(table.rows).filter(visible);
    const header = rows.find((row) =>
      Array.from(row.cells).some((c) =>
        /^(vendor|vendor name|company name|name)$/i.test(
          c.textContent?.trim() ?? "",
        ),
      ),
    );
    if (!header) continue;
    const column = Array.from(header.cells).findIndex((c) =>
      /^(vendor|vendor name|company name|name)$/i.test(
        c.textContent?.trim() ?? "",
      ),
    );
    const data = rows
      .slice(rows.indexOf(header) + 1)
      .filter(
        (row) =>
          row.cells.length >= header.cells.length &&
          row.cells[column]?.textContent?.trim(),
      );
    const total = /(?:total\s*:\s*|all\s+)(\d+)(?:\s|$)/i.exec(
      observation.text,
    );
    const noPagination = /no pagination/i.test(observation.text);
    if ((!total || Number(total[1]) !== data.length) && !noPagination)
      return incomplete(
        "The complete vendor list could not be verified. Check filters and pagination before creating a vendor.",
      );
    if (
      observation.elements.some(
        (e) => /search|filter/i.test(e.label) && e.value?.trim(),
      )
    )
      return incomplete(
        "Clear vendor-list searches and filters to check all displayed vendors.",
      );
    const key = (value: string) =>
      normalize(value).replace(/[^\p{L}\p{N}]/gu, "");
    const requested = key(name);
    const matches = data.flatMap((row) => {
      const existing = row.cells[column].textContent!.trim(),
        candidate = key(existing);
      if (
        !requested ||
        !(candidate.includes(requested) || requested.includes(candidate))
      )
        return [];
      const link =
        row.cells[column].querySelector<HTMLAnchorElement>("a[href]");
      return [{ name: existing, url: link?.href ?? null }];
    });
    return {
      name,
      complete: true,
      matches,
      reason: matches.length
        ? "An existing or similar vendor was found. Review it before creating another."
        : `No matching or similar vendor in the complete visible list (${data.length} records).`,
    };
  }
  return incomplete(
    "A complete vendor-name table is not available. No vendor creation proposed.",
  );
}
export function savedVendorUrl(
  observation: Observation,
  values: VendorValues,
): string | null {
  const u = new URL(observation.context.url);
  const record =
    /\/vendor\.nl$/i.test(u.pathname) &&
    /^\d+$/.test(u.searchParams.get("id") ?? "") &&
    u.searchParams.get("e") !== "T";
  const fixtureRecord =
    u.pathname.startsWith("/demo/netsuite") &&
    /^#vendor-record-\d+$/.test(u.hash);
  return observation.context.app === "netsuite" &&
    (record || fixtureRecord) &&
    observation.context.workflow === "vendor_record" &&
    normalize(observation.text).includes(normalize(values.name))
    ? u.href
    : null;
}
