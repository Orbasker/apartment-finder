import { describe, expect, test } from "vitest";
import { checkAttributeRequirements } from "./match";
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
  });

  test("required_true fails when listing has value=false", () => {
    const r = checkAttributeRequirements(
      [{ key: "elevator", requirement: "required_true" }],
      known([["elevator", false]]),
      true,
    );
    expect(r.pass).toBe(false);
  });

  test("required_true fails on unknown when strictUnknowns=true", () => {
    const r = checkAttributeRequirements(
      [{ key: "elevator", requirement: "required_true" }],
      known([]),
      true,
    );
    expect(r.pass).toBe(false);
  });

  test("required_true passes on unknown when strictUnknowns=false", () => {
    const r = checkAttributeRequirements(
      [{ key: "elevator", requirement: "required_true" }],
      known([]),
      false,
    );
    expect(r.pass).toBe(true);
    expect(r.matchedAttributes).toEqual([]);
  });

  test("required_false fails when listing has value=true", () => {
    const r = checkAttributeRequirements(
      [{ key: "shared_apartment", requirement: "required_false" }],
      known([["shared_apartment", true]]),
      true,
    );
    expect(r.pass).toBe(false);
  });

  test("required_false passes when listing has value=false", () => {
    const r = checkAttributeRequirements(
      [{ key: "shared_apartment", requirement: "required_false" }],
      known([["shared_apartment", false]]),
      true,
    );
    expect(r.pass).toBe(true);
    expect(r.matchedAttributes).toEqual(["shared_apartment"]);
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
});
