"use client";

import { useState } from "react";
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

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function parseMonth(dateStr: string): string {
  if (!dateStr) return "01";
  return dateStr.split("-")[1] ?? "01";
}

export function PartialDateInput({
  dateValue,
  precisionValue,
  onDateChange,
  onPrecisionChange,
  label,
  disabled,
}: PartialDateInputProps) {
  const [yearInput, setYearInput] = useState(() => {
    if (!dateValue || precisionValue === "UNKNOWN") return "";
    return dateValue.split("-")[0] ?? "";
  });

  const month = parseMonth(dateValue);

  function handlePrecisionChange(newPrecision: string) {
    onPrecisionChange(newPrecision);
    if (newPrecision === "UNKNOWN") {
      setYearInput("");
      onDateChange("");
    } else if (newPrecision === "YEAR" && yearInput.length === 4) {
      onDateChange(`${yearInput}-01-01`);
    } else if (newPrecision === "MONTH" && yearInput.length === 4) {
      onDateChange(`${yearInput}-${month || "01"}-01`);
    } else if (newPrecision === "YEAR" || newPrecision === "MONTH") {
      // Switching to Year/Month with no valid year yet — sync yearInput from existing date
      if (dateValue) {
        const existingYear = dateValue.split("-")[0] ?? "";
        setYearInput(existingYear);
      }
    }
    // DAY: keep existing dateValue as-is (user will pick via date input)
  }

  function handleYearChange(raw: string) {
    const val = raw.replace(/\D/g, "").slice(0, 4);
    setYearInput(val);

    if (!val) {
      onDateChange("");
      return;
    }
    if (val.length === 4) {
      if (precisionValue === "YEAR") {
        onDateChange(`${val}-01-01`);
      } else if (precisionValue === "MONTH") {
        onDateChange(`${val}-${month || "01"}-01`);
      }
    } else {
      onDateChange("");
    }
  }

  function handleMonthChange(newMonth: string) {
    if (yearInput.length === 4) {
      onDateChange(`${yearInput}-${newMonth}-01`);
    }
  }

  return (
    <div className="space-y-2">
      {label && (
        <p className="text-sm font-medium leading-none">{label}</p>
      )}
      <div className="flex gap-2">
        <Select
          value={precisionValue}
          onValueChange={handlePrecisionChange}
          disabled={disabled}
        >
          <SelectTrigger className="w-[120px] shrink-0">
            <SelectValue placeholder="Precision" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="UNKNOWN">Unknown</SelectItem>
            <SelectItem value="YEAR">Year</SelectItem>
            <SelectItem value="MONTH">Month</SelectItem>
            <SelectItem value="DAY">Day</SelectItem>
          </SelectContent>
        </Select>

        {precisionValue === "YEAR" && (
          <Input
            type="text"
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
            placeholder="YYYY"
            value={yearInput}
            onChange={(e) => handleYearChange(e.target.value)}
            disabled={disabled}
            className="w-[100px]"
          />
        )}

        {precisionValue === "MONTH" && (
          <div className="flex gap-1.5 flex-1">
            <Select
              value={month || "01"}
              onValueChange={handleMonthChange}
              disabled={disabled}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent>
                {MONTH_NAMES.map((name, i) => (
                  <SelectItem
                    key={name}
                    value={String(i + 1).padStart(2, "0")}
                  >
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{4}"
              maxLength={4}
              placeholder="YYYY"
              value={yearInput}
              onChange={(e) => handleYearChange(e.target.value)}
              disabled={disabled}
              className="w-[100px]"
            />
          </div>
        )}

        {precisionValue === "DAY" && (
          <Input
            type="date"
            value={dateValue}
            onChange={(e) => onDateChange(e.target.value)}
            disabled={disabled}
            className="flex-1"
          />
        )}
      </div>
    </div>
  );
}
