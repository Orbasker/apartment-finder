import { describe, expect, test } from "vitest";
import { checkAttributeRequirements, isWithinRadiusKm } from "./match";
import type { ApartmentAttributeKey } from "@apartment-finder/shared";

const known = (entries: Array<[ApartmentAttributeKey, boolean]>) => new Map(entries);

describe("checkAttributeRequirements", () => {
  test("required_true passes when listing has value=true", () => {
    const r = checkAttributeRequirements(
      [{ key: "elevator", requirement: "required_true" }],
      known([["elevator", true]]),
      true,
    );
    expect(r.pass).toBe(true);
    expect(r.matchedAttributes).toEqual(["elevator"]);
    expect(r.unverifiedAttributes).toEqual([]);
  });

  test("required_true fails when listing has value=false", () => {
    const r = checkAttributeRequirements(
      [{ key: "elevator", requirement: "required_true" }],
      known([["elevator", false]]),
      true,
    );
    expect(r.pass).toBe(false);
    expect(r.unverifiedAttributes).toEqual([]);
  });

  test("required_true fails on unknown when notifyOnUnknownMustHave=false", () => {
    const r = checkAttributeRequirements(
      [{ key: "elevator", requirement: "required_true" }],
      known([]),
      false,
    );
    expect(r.pass).toBe(false);
    expect(r.unverifiedAttributes).toEqual([]);
  });

  test("required_true passes on unknown when notifyOnUnknownMustHave=true (and tags as unverified)", () => {
    const r = checkAttributeRequirements(
      [{ key: "elevator", requirement: "required_true" }],
      known([]),
      true,
    );
    expect(r.pass).toBe(true);
    expect(r.matchedAttributes).toEqual([]);
    expect(r.unverifiedAttributes).toEqual(["elevator"]);
  });

  test("required_true passes on unknown when notifyOnUnknownMustHave=true", () => {
    const r = checkAttributeRequirements(
      [{ key: "elevator", requirement: "required_true" }],
      known([]),
      true,
    );
    expect(r.pass).toBe(true);
    expect(r.matchedAttributes).toEqual([]);
    expect(r.unverifiedAttributes).toEqual(["elevator"]);
  });

  test("required_false passes on unknown when notifyOnUnknownMustHave=true (and tags as unverified)", () => {
    const r = checkAttributeRequirements(
      [{ key: "shared_apartment", requirement: "required_false" }],
      known([]),
      true,
    );
    expect(r.pass).toBe(true);
    expect(r.matchedAttributes).toEqual([]);
    expect(r.unverifiedAttributes).toEqual(["shared_apartment"]);
  });

  test("required_false fails on unknown when notifyOnUnknownMustHave=false", () => {
    const r = checkAttributeRequirements(
      [{ key: "shared_apartment", requirement: "required_false" }],
      known([]),
      false,
    );
    expect(r.pass).toBe(false);
  });

  test("mixed: confirmed must-haves match while unknowns get tagged unverified", () => {
    const r = checkAttributeRequirements(
      [
        { key: "elevator", requirement: "required_true" },
        { key: "parking", requirement: "required_true" },
        { key: "shared_apartment", requirement: "required_false" },
      ],
      known([
        ["elevator", true],
        ["shared_apartment", false],
      ]),
      true,
    );
    expect(r.pass).toBe(true);
    expect(r.matchedAttributes.sort()).toEqual(["elevator", "shared_apartment"]);
    expect(r.unverifiedAttributes).toEqual(["parking"]);
  });

  test("required_false fails when listing has value=true", () => {
    const r = checkAttributeRequirements(
      [{ key: "shared_apartment", requirement: "required_false" }],
      known([["shared_apartment", true]]),
      true,
    );
    expect(r.pass).toBe(false);
    expect(r.unverifiedAttributes).toEqual([]);
  });

  test("required_false passes when listing has value=false", () => {
    const r = checkAttributeRequirements(
      [{ key: "shared_apartment", requirement: "required_false" }],
      known([["shared_apartment", false]]),
      true,
    );
    expect(r.pass).toBe(true);
    expect(r.matchedAttributes).toEqual(["shared_apartment"]);
    expect(r.unverifiedAttributes).toEqual([]);
  });

  test("preferred_true never fails the match (advisory only)", () => {
    const allMisses = checkAttributeRequirements(
      [
        { key: "elevator", requirement: "preferred_true" },
        { key: "balcony", requirement: "preferred_true" },
      ],
      known([]),
      true,
    );
    expect(allMisses.pass).toBe(true);
    expect(allMisses.matchedAttributes).toEqual([]);

    const oneHit = checkAttributeRequirements(
      [{ key: "elevator", requirement: "preferred_true" }],
      known([["elevator", true]]),
      true,
    );
    expect(oneHit.pass).toBe(true);
    expect(oneHit.matchedAttributes).toEqual(["elevator"]);
  });

  test("dont_care is a no-op", () => {
    const r = checkAttributeRequirements(
      [{ key: "elevator", requirement: "dont_care" }],
      known([["elevator", false]]),
      true,
    );
    expect(r.pass).toBe(true);
  });

  test("multiple required clauses: one failing causes overall fail", () => {
    const r = checkAttributeRequirements(
      [
        { key: "elevator", requirement: "required_true" },
        { key: "shared_apartment", requirement: "required_false" },
      ],
      known([
        ["elevator", true],
        ["shared_apartment", true],
      ]),
      true,
    );
    expect(r.pass).toBe(false);
  });

  test("multiple required clauses: all matching collects all matched", () => {
    const r = checkAttributeRequirements(
      [
        { key: "elevator", requirement: "required_true" },
        { key: "parking", requirement: "required_true" },
        { key: "shared_apartment", requirement: "required_false" },
      ],
      known([
        ["elevator", true],
        ["parking", true],
        ["shared_apartment", false],
      ]),
      true,
    );
    expect(r.pass).toBe(true);
    expect(r.matchedAttributes.sort()).toEqual(["elevator", "parking", "shared_apartment"]);
  });
  test("unknown must-haves with notifyOnUnknownMustHave=true: tracks unknowns and passes", () => {
    const r = checkAttributeRequirements(
      [
        { key: "elevator", requirement: "required_true" },
        { key: "parking", requirement: "required_true" },
      ],
      known([["elevator", true]]),
      true,
    );
    expect(r.pass).toBe(true);
    expect(r.matchedAttributes).toEqual(["elevator"]);
    expect(r.unverifiedAttributes).toEqual(["parking"]);
  });

  test("unknown must-haves with notifyOnUnknownMustHave=false: fails", () => {
    const r = checkAttributeRequirements(
      [
        { key: "elevator", requirement: "required_true" },
        { key: "parking", requirement: "required_true" },
      ],
      known([["elevator", true]]),
      false,
    );
    expect(r.pass).toBe(false);
    expect(r.unverifiedAttributes).toEqual([]);
  });

  test("required_false unknown with notifyOnUnknownMustHave=true: tracks unknown and passes", () => {
    const r = checkAttributeRequirements(
      [{ key: "shared_apartment", requirement: "required_false" }],
      known([]),
      true,
    );
    expect(r.pass).toBe(true);
    expect(r.unverifiedAttributes).toEqual(["shared_apartment"]);
  });

  test("required_false unknown with notifyOnUnknownMustHave=false: fails", () => {
    const r = checkAttributeRequirements(
      [{ key: "shared_apartment", requirement: "required_false" }],
      known([]),
      false,
    );
    expect(r.pass).toBe(false);
    expect(r.unverifiedAttributes).toEqual([]);
  });
});

describe("isWithinRadiusKm", () => {
  const center = {
    centerLat: 32.0853,
    centerLon: 34.7818,
  };

  test("passes when apartment is inside the configured radius", () => {
    expect(
      isWithinRadiusKm({
        apartmentLat: 32.087,
        apartmentLon: 34.789,
        ...center,
        radiusKm: 1,
      }),
    ).toBe(true);
  });

  test("fails when apartment is outside the configured radius", () => {
    expect(
      isWithinRadiusKm({
        apartmentLat: 32.05,
        apartmentLon: 34.75,
        ...center,
        radiusKm: 1,
      }),
    ).toBe(false);
  });

  test("fails gracefully when apartment coordinates are missing", () => {
    expect(
      isWithinRadiusKm({
        apartmentLat: null,
        apartmentLon: 34.789,
        ...center,
        radiusKm: 1,
      }),
    ).toBe(false);
  });
});
