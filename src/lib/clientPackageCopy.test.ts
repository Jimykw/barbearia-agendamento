import { describe, expect, it } from "vitest";
import {
  formatPackageSessionsLabel,
  formatPackageSessionsShort,
  formatSubscriptionSessionsProgress,
} from "./clientPackageCopy";

describe("clientPackageCopy", () => {
  it("formatPackageSessionsLabel unlimited", () => {
    expect(formatPackageSessionsLabel(4, true)).toBe("Sessões ilimitadas");
  });

  it("formatPackageSessionsLabel counted", () => {
    expect(formatPackageSessionsLabel(1, false)).toBe("1 sessão");
    expect(formatPackageSessionsLabel(4, false)).toBe("4 sessões");
  });

  it("formatPackageSessionsShort", () => {
    expect(formatPackageSessionsShort(10, true)).toBe("Ilimitadas");
    expect(formatPackageSessionsShort(2, false)).toBe("2 sessões");
  });

  it("formatSubscriptionSessionsProgress", () => {
    expect(
      formatSubscriptionSessionsProgress({
        sessions_used: 2,
        sessions_total: 4,
        sessions_unlimited: true,
      }),
    ).toBe("Ilimitado");
    expect(
      formatSubscriptionSessionsProgress({
        sessions_used: 1,
        sessions_total: 4,
        sessions_unlimited: false,
      }),
    ).toBe("1/4");
  });
});
