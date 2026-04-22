const APP_TIME_ZONE = "Asia/Jerusalem";

type LocalTimeParts = {
  hour: number;
  minute: number;
};

function getLocalTimeParts(date: Date): LocalTimeParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(date);

  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);

  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    throw new Error("Failed to resolve local schedule time");
  }

  return { hour, minute };
}

export function getScheduleTimeZone(): string {
  return APP_TIME_ZONE;
}

export function shouldRunYad2Poll(date = new Date()): boolean {
  const { hour } = getLocalTimeParts(date);
  return hour === 0 || hour >= 8;
}

export function shouldRunApifyPoll(date = new Date()): boolean {
  const { hour, minute } = getLocalTimeParts(date);
  return minute === 0 && [8, 11, 14, 17, 20].includes(hour);
}

export function describeLocalSchedule(date = new Date()): string {
  const { hour, minute } = getLocalTimeParts(date);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${APP_TIME_ZONE}`;
}
