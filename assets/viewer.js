"use strict";

(() => {
  const fields = ["product", "on_hand", "last_updated"];
  const names = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  const quantities = new Intl.NumberFormat();
  const dates = new Intl.DateTimeFormat(undefined, {
    year: "numeric", month: "short", day: "numeric", timeZone: "UTC"
  });

  function isCalendarDate(value) {
    if (typeof value !== "string" || value.length !== 10 ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
    const date = new Date(value + "T00:00:00Z");
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function validateInventory(data) {
    if (!Array.isArray(data)) throw new Error("Expected an array of inventory records.");
    return data.map((item, index) => {
      if (item === null || typeof item !== "object" || Array.isArray(item) ||
          Object.keys(item).some(key => !fields.includes(key)) ||
          typeof item.product !== "string" || !item.product.trim() ||
          !Number.isSafeInteger(item.on_hand) || item.on_hand < 0 ||
          (item.last_updated != null && !isCalendarDate(item.last_updated))) {
        throw new Error("Invalid inventory record at position " + (index + 1) + ".");
      }
      return { product: item.product.trim(), on_hand: item.on_hand, last_updated: item.last_updated ?? null };
    });
  }

  function selectProducts(records, search, sort) {
    const query = search.trim().toLocaleLowerCase();
    const [field, order] = sort.split("-");
    const direction = order === "desc" ? -1 : 1;
    const result = records.filter(row => row.product.toLocaleLowerCase().includes(query));
    return result.sort((a, b) => {
      const byName = names.compare(a.product, b.product);
      if (field === "product") return byName * direction;
      if (field === "on_hand") return (a.on_hand - b.on_hand) * direction || byName;
      if (a.last_updated === b.last_updated) return byName;
      if (a.last_updated === null) return 1;
      if (b.last_updated === null) return -1;
      return (a.last_updated < b.last_updated ? -1 : 1) * direction;
    });
  }

  function formatDate(value) {
    return value === null ? "Unknown" : dates.format(new Date(value + "T00:00:00Z"));
  }

  function renderRows(doc, rows) {
    const fragment = doc.createDocumentFragment();
    for (const row of rows) {
      const tr = doc.createElement("tr");
      for (const value of [row.product, quantities.format(row.on_hand), formatDate(row.last_updated)]) {
        const cell = doc.createElement("td");
        cell.textContent = value;
        tr.appendChild(cell);
      }
      fragment.appendChild(tr);
    }
    return fragment;
  }

  async function startViewer(doc, load) {
    const search = doc.getElementById("search");
    const sort = doc.getElementById("sort");
    const table = doc.getElementById("inventory-table");
    const body = doc.getElementById("rows");
    const status = doc.getElementById("status");
    status.textContent = "Loading inventory…";
    let records;
    try {
      const source = doc.querySelector("[data-inventory-src]").dataset.inventorySrc;
      const response = await load(source, {
        mode: "same-origin", credentials: "omit", redirect: "error", cache: "no-cache"
      });
      if (!response.ok) throw new Error("Inventory file unavailable.");
      try {
        records = validateInventory(await response.json());
      } catch {
        status.dataset.state = "error";
        status.textContent = "Inventory could not be displayed. The data file contains invalid inventory data.";
        return;
      }
    } catch {
      status.dataset.state = "error";
      status.textContent = "Inventory could not be loaded. Check your connection or try again later.";
      return;
    }

    function update() {
      const rows = selectProducts(records, search.value, sort.value);
      body.replaceChildren(renderRows(doc, rows));
      table.hidden = rows.length === 0;
      status.dataset.state = rows.length ? "count" : "message";
      if (!records.length) {
        status.textContent = "No inventory products are available.";
      } else if (!rows.length) {
        status.textContent = "No products match your search. Try another product name.";
      } else {
        const count = search.value.trim() ? rows.length + " of " + records.length : records.length;
        status.textContent = "Showing " + count + (records.length === 1 ? " product" : " products");
      }
    }

    search.disabled = sort.disabled = records.length === 0;
    search.addEventListener("input", update);
    sort.addEventListener("change", update);
    update();
  }

  if (typeof module === "object" && module.exports) {
    module.exports = { validateInventory, selectProducts, formatDate, renderRows, startViewer };
  } else {
    startViewer(document, window.fetch.bind(window));
  }
})();
