"use client";

import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type PartialDateInputProps = {
  dateValue: string;
  precisionValue: string;
  onDateChange: (val: string) => void;
  onPrecisionChange: (val: string) => void;
  label?: string;
  disabled?: boolean;
};

const MONTH_OPTIONS = [
  { value: "01", label: "January" },
  { value: "02", label: "February" },
  { value: "03", label: "March" },
  { value: "04", label: "April" },
  { value: "05", label: "May" },
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Extract the year/month/day parts from the controlled props */
function deriveFromProps(dateValue: string, precisionValue: string) {
  if (!dateValue || precisionValue === "UNKNOWN") {
    return { year: "", month: "", day: "" };
  }
  const parts = dateValue.split("-");
  const year = parts[0] ?? "";
  const month = precisionValue === "YEAR" ? "" : (parts[1] ?? "");
  const day = precisionValue === "DAY" ? (parts[2] ?? "") : "";
  return { year, month, day };
}

export function PartialDateInput({
  dateValue,
  precisionValue,
  onDateChange,
  onPrecisionChange,
  label,
  disabled,
}: PartialDateInputProps) {
  // Only the year input needs transient local state (while user types < 4 digits)
  // Month and day are set atomically (select / blur), so they can be fully derived.
  const derived = deriveFromProps(dateValue, precisionValue);

  // yearDraft tracks what's in the input — may diverge from props while typing
  const [yearDraft, setYearDraft] = useState(derived.year);
  // Track which props we last synced from, to detect external resets
  const [syncedProps, setSyncedProps] = useState({ dateValue, precisionValue });

  // If props changed externally (form reset, edit load), re-sync yearDraft
  if (syncedProps.dateValue !== dateValue || syncedProps.precisionValue !== precisionValue) {
    setSyncedProps({ dateValue, precisionValue });
    const newDerived = deriveFromProps(dateValue, precisionValue);
    setYearDraft(newDerived.year);
  }

  const emit = useCallback(
    (y: string, m: string, d: string) => {
      if (y.length !== 4) {
        onPrecisionChange("UNKNOWN");
        onDateChange("");
        return;
      }
      if (!m) {
        onPrecisionChange("YEAR");
        onDateChange(`${y}-01-01`);
        return;
      }
      if (!d) {
        onPrecisionChange("MONTH");
        onDateChange(`${y}-${m}-01`);
        return;
      }
      onPrecisionChange("DAY");
      onDateChange(`${y}-${m}-${d}`);
    },
    [onDateChange, onPrecisionChange],
  );

  const hasValidYear = yearDraft.length === 4;
  const hasMonth = hasValidYear && derived.month !== "";
  const hasDay = hasMonth && derived.day !== "";

  function handleYearChange(raw: string) {
    const val = raw.replace(/\D/g, "").slice(0, 4);
    setYearDraft(val);
    if (val.length === 4) {
      emit(val, derived.month, derived.day);
    } else {
      // Incomplete year — clear everything upstream
      emit(val, "", "");
    }
  }

  function handleMonthChange(val: string) {
    if (val === "none") {
      emit(yearDraft, "", "");
      return;
    }
    // Clamp day if we had one
    if (derived.day) {
      const maxDay = daysInMonth(Number(yearDraft), Number(val));
      const clamped = String(Math.min(Number(derived.day), maxDay)).padStart(2, "0");
      emit(yearDraft, val, clamped);
    } else {
      emit(yearDraft, val, "");
    }
  }

  // Day also needs a local draft for typing
  const [dayDraft, setDayDraft] = useState(derived.day);
  // Sync day draft from props
  if (derived.day !== dayDraft && (syncedProps.dateValue !== dateValue || syncedProps.precisionValue !== precisionValue)) {
    // Already handled by the syncedProps block above, but we also need dayDraft reset
  }
  // Simpler: always derive dayDraft from props unless actively typing
  const [dayFocused, setDayFocused] = useState(false);
  const displayDay = dayFocused ? dayDraft : derived.day;

  function handleDayChange(raw: string) {
    const val = raw.replace(/\D/g, "").slice(0, 2);
    setDayDraft(val);
    if (val.length === 2 && derived.month) {
      const maxDay = daysInMonth(Number(yearDraft), Number(derived.month));
      const num = Math.min(Math.max(Number(val), 1), maxDay);
      const dayStr = String(num).padStart(2, "0");
      setDayDraft(dayStr);
      emit(yearDraft, derived.month, dayStr);
    } else if (!val) {
      emit(yearDraft, derived.month, "");
    }
  }

  function handleDayBlur() {
    setDayFocused(false);
    if (!dayDraft) return;
    if (derived.month) {
      const maxDay = daysInMonth(Number(yearDraft), Number(derived.month));
      const num = Math.min(Math.max(Number(dayDraft), 1), maxDay);
      const dayStr = String(num).padStart(2, "0");
      setDayDraft(dayStr);
      emit(yearDraft, derived.month, dayStr);
    }
  }

  function handleDayFocus() {
    setDayFocused(true);
    setDayDraft(derived.day);
  }

  const precisionLabel = !hasValidYear
    ? "No date"
    : !hasMonth
      ? "Year only"
      : !hasDay
        ? "Year + month"
        : "Full date";

  return (
    <div className="space-y-1.5">
      {label && (
        <p className="text-sm font-medium leading-none">{label}</p>
      )}
      <div className="flex gap-2 items-center">
        <Input
          type="text"
          inputMode="numeric"
          pattern="[0-9]{4}"
          maxLength={4}
          placeholder="YYYY"
          value={yearDraft}
          onChange={(e) => handleYearChange(e.target.value)}
          disabled={disabled}
          className="w-[80px]"
        />

        {hasValidYear && (
          <Select
            value={derived.month || "none"}
            onValueChange={handleMonthChange}
            disabled={disabled}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">&mdash;</SelectItem>
              {MONTH_OPTIONS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {hasMonth && (
          <Input
            type="text"
            inputMode="numeric"
            pattern="[0-9]{1,2}"
            maxLength={2}
            placeholder="DD"
            value={displayDay}
            onChange={(e) => handleDayChange(e.target.value)}
            onFocus={handleDayFocus}
            onBlur={handleDayBlur}
            disabled={disabled}
            className="w-[60px]"
          />
        )}
      </div>
      <p className="text-xs text-muted-foreground">{precisionLabel}</p>
    </div>
  );
}
