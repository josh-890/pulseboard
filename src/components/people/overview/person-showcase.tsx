"use client";

import { getPersonShowcaseAction } from "@/lib/actions/person-actions";
import type { PersonShowcase as PersonShowcaseData } from "@/lib/services/person-showcase-service";
import { ShowcaseMosaic } from "./showcase-mosaic";

// A person's Showcase: the shared mosaic over the photos that show them

export type PersonShowcaseProps = {
  showcase: PersonShowcaseData;
  personName: string;
  /** Seeds the lightbox's "assign to detail" picker */
  person: { id: string; name: string };
};

export function PersonShowcase({ showcase, personName, person }: PersonShowcaseProps) {
  return (
    <ShowcaseMosaic
      showcase={showcase}
      title={personName}
      person={person}
      load={(mode, seed) => getPersonShowcaseAction(person.id, mode, seed)}
    />
  );
}
