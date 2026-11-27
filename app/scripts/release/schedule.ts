const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const dayMs = 86_400_000;

type Schedule = {
	every: 'week' | '2 weeks' | 'month';
	day: string;
	hourUtc: number;
	anchor: string;
};

export function cutoffs(schedule: Schedule, after: Date | undefined, until: Date): Date[] {
	const { anchor, day, every, hourUtc } = schedule;
	const weekday = weekdays.indexOf(day);
	const start = new Date(anchor + 'T00:00:00Z');
	if (
		!['week', '2 weeks', 'month'].includes(every) ||
		weekday < 0 ||
		!Number.isInteger(hourUtc) ||
		hourUtc < 0 ||
		hourUtc > 23 ||
		!Number.isFinite(+start) ||
		start.toISOString().slice(0, 10) !== anchor ||
		!Number.isFinite(+until)
	)
		throw new Error('Invalid release schedule or cutoff time');
	start.setUTCHours(hourUtc);
	const result: Date[] = [];
	const include = (date: Date) => {
		if (date >= start && date <= until && (!after || date > after)) result.push(date);
	};
	if (every === 'month') {
		const from = after && after > start ? after : start;
		const month = new Date(from);
		month.setUTCDate(1);
		month.setUTCHours(hourUtc, 0, 0, 0);
		for (; month <= until; month.setUTCMonth(month.getUTCMonth() + 1)) {
			const first = new Date(month);
			first.setUTCDate(1 + ((weekday - first.getUTCDay() + 7) % 7));
			include(first);
		}
	} else {
		const interval = (every === 'week' ? 7 : 14) * dayMs;
		const first = after ? Math.max(0, Math.floor((+after - +start) / interval) + 1) : 0;
		for (let time = +start + first * interval; time <= +until; time += interval)
			include(new Date(time));
	}
	return result;
}
