import { describe, expect, it } from "vitest";
import { applyPivot, datePivotParts, isPivotActive, type PivotFacet } from "@/lib/pivot-filter";

const params = (s: string) => new URLSearchParams(s);
const channel = (value: string): PivotFacet => ({ kind: "value", param: "channel", value });
const date = (value: string): PivotFacet => ({ kind: "date", from: "releaseDateFrom", to: "releaseDateTo", value });
const person = (id: string): PivotFacet => ({ kind: "person", id, display: `Anna (${id.toUpperCase()})` });

describe("applyPivot", () => {
  it("adds the value next to the active filters and starts paging over", () => {
    const next = applyPivot(params("q=beach&type=all&loaded=150&sort=date-asc"), channel("c1"));
    expect(next.get("channel")).toBe("c1");
    expect(next.get("q")).toBe("beach");
    expect(next.get("type")).toBe("all");
    expect(next.get("sort")).toBe("date-asc");
    expect(next.has("loaded")).toBe(false);
  });

  it("replaces a value of the same kind, keeps the others", () => {
    const next = applyPivot(params("channel=c1,c2&releaseDateFrom=2016&releaseDateTo=2016&personId=p1&personName=A"), channel("c3"));
    expect(next.get("channel")).toBe("c3");
    expect(next.get("releaseDateFrom")).toBe("2016");
    expect(next.get("personId")).toBe("p1");

    const month = applyPivot(next, date("2016-08"));
    expect([month.get("releaseDateFrom"), month.get("releaseDateTo")]).toEqual(["2016-08", "2016-08"]);

    const other = applyPivot(month, person("p2"));
    expect([other.get("personId"), other.get("personName")]).toEqual(["p2", "Anna (P2)"]);
  });

  it("takes the value away when it is the one already active", () => {
    expect(applyPivot(params("channel=c1&q=x"), channel("c1")).toString()).toBe("q=x");
    expect(applyPivot(params("releaseDateFrom=2016-08&releaseDateTo=2016-08"), date("2016-08")).toString()).toBe("");
    expect(applyPivot(params("personId=p1&personName=A"), person("p1")).toString()).toBe("");
  });

  it("narrows a several-channel filter to the one clicked rather than removing it", () => {
    expect(applyPivot(params("channel=c1,c2"), channel("c1")).get("channel")).toBe("c1");
  });

  it("leaves its input untouched", () => {
    const before = params("channel=c1");
    applyPivot(before, channel("c2"));
    expect(before.get("channel")).toBe("c1");
  });
});

describe("isPivotActive", () => {
  it("is active only for exactly that value", () => {
    expect(isPivotActive(params("channel=c1"), channel("c1"))).toBe(true);
    expect(isPivotActive(params("channel=c1,c2"), channel("c1"))).toBe(false);
    expect(isPivotActive(params("releaseDateFrom=2016&releaseDateTo=2017"), date("2016"))).toBe(false);
    expect(isPivotActive(params("releaseDateFrom=2016&releaseDateTo=2016"), date("2016"))).toBe(true);
  });
});

describe("datePivotParts", () => {
  const d = new Date(Date.UTC(2016, 7, 5));
  it("follows the precision as the card shows the date", () => {
    expect(datePivotParts(d, "DAY")).toEqual([
      { text: "2016", value: "2016", title: "2016" },
      { text: "08", value: "2016-08", title: "Aug 2016" },
      { text: "05", value: "2016-08-05", title: "5 Aug 2016" },
    ]);
    expect(datePivotParts(d, "MONTH").map((p) => p.value)).toEqual(["2016", "2016-08"]);
    expect(datePivotParts(d, "YEAR").map((p) => p.value)).toEqual(["2016"]);
    expect(datePivotParts(d, null).map((p) => p.value)).toEqual(["2016"]);
    expect(datePivotParts(null, "DAY")).toEqual([]);
  });
});
