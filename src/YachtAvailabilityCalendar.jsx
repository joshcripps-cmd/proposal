import { useState, useMemo } from "react";

const MONTHS = ['Apr','May','Jun','Jul','Aug','Sep','Oct'];
const MONTH_NUMS = [3,4,5,6,7,8,9];
const TODAY = new Date();

function parseDate(s) {
  if (!s) return null;
  return new Date(s);
}

function getWeeksForMonth(year, month) {
  const weeks = [];
  let d = new Date(year, month, 1);
  while (d.getDay() !== 6) d.setDate(d.getDate() - 1);
  let safety = 0;
  while (safety < 8) {
    if (d.getMonth() === month) weeks.push(new Date(d));
    else if (weeks.length > 0) break;
    d.setDate(d.getDate() + 7);
    safety++;
  }
  return weeks;
}

function getWeekEnd(weekStart) {
  const e = new Date(weekStart);
  e.setDate(e.getDate() + 6);
  return e;
}

function dateOverlaps(wStart, wEnd, bStart, bEnd) {
  return wStart <= bEnd && wEnd >= bStart;
}

function fmtShort(d) {
  const ms = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getDate()} ${ms[d.getMonth()]}`;
}

function toInputDate(d) {
  return d.toISOString().split('T')[0];
}

const styles = {
  card: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: '1.25rem',
    marginBottom: '1.25rem',
    fontFamily: "'DM Sans', sans-serif",
  },
  yachtName: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 20,
    fontWeight: 700,
    color: '#193660',
  },
  monthLabel: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    color: '#6b7280',
    marginBottom: 5,
  },
  weekBase: {
    height: 22,
    borderRadius: 4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 10,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'transform 0.12s, background 0.12s',
    marginBottom: 2,
    position: 'relative',
    userSelect: 'none',
  },
  legend: {
    display: 'flex',
    gap: 16,
    marginTop: 12,
    flexWrap: 'wrap',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    color: '#6b7280',
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  refreshBtn: {
    fontSize: 12,
    color: '#193660',
    background: 'transparent',
    border: '1px solid #193660',
    borderRadius: 6,
    padding: '3px 10px',
    cursor: 'pointer',
  },
};

function WeekCell({ wStart, bookings, onSelect, isSelected }) {
  const [hovered, setHovered] = useState(false);
  const wEnd = getWeekEnd(wStart);
  const isPast = wEnd < TODAY;
  const booking = bookings.find(b =>
    dateOverlaps(wStart, wEnd, parseDate(b.start_date), parseDate(b.end_date))
  );

  let bg, color, cursor;
  if (isPast) { bg = '#f3f4f6'; color = '#9ca3af'; cursor = 'default'; }
  else if (isSelected) { bg = '#193660'; color = '#fff'; cursor = 'pointer'; }
  else if (booking) {
    bg = booking.status === 'option' ? '#fef3c7' : '#fee2e2';
    color = booking.status === 'option' ? '#92400e' : '#991b1b';
    cursor = 'default';
  } else {
    bg = hovered ? '#6ee7b7' : '#d1fae5';
    color = '#065f46';
    cursor = 'pointer';
  }

  const label = `${wStart.getDate()}`;
  const canClick = !isPast && !booking;

  return (
    <div
      style={{ ...styles.weekBase, background: bg, color, cursor, transform: (hovered && canClick) ? 'scale(1.06)' : 'scale(1)' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => canClick && onSelect(wStart, wEnd, booking)}
      title={booking ? (booking.route || booking.status) : isPast ? '' : 'Click to enquire'}
    >
      {label}
      {booking && hovered && (
        <div style={{
          position: 'absolute', bottom: '110%', left: '50%', transform: 'translateX(-50%)',
          background: '#193660', color: '#fff', fontSize: 10, padding: '3px 7px',
          borderRadius: 4, whiteSpace: 'nowrap', zIndex: 20, pointerEvents: 'none',
        }}>
          {booking.route || booking.status}
        </div>
      )}
    </div>
  );
}

export default function YachtAvailabilityCalendar({ yacht, bookings = [], year = 2026, onEnquire, onRefresh, isAdmin = false }) {
  const [selectedWeek, setSelectedWeek] = useState(null);

  const allMonths = useMemo(() =>
    MONTHS.map((label, i) => ({
      label,
      monthNum: MONTH_NUMS[i],
      weeks: getWeeksForMonth(year, MONTH_NUMS[i]),
    })), [year]
  );

  function handleSelect(wStart, wEnd) {
    const week = { start: wStart, end: wEnd };
    setSelectedWeek(week);
    if (onEnquire) onEnquire(yacht, week);
  }

  return (
    <div style={styles.card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid #f0f0f0' }}>
        <div style={styles.yachtName}>{yacht.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {yacht.price_high && (
            <div style={{ fontSize: 13, color: '#D44035', fontWeight: 600 }}>
              €{Number(yacht.price_high).toLocaleString()}<span style={{ fontSize: 11, fontWeight: 400, color: '#9ca3af' }}>/wk</span>
            </div>
          )}
          {isAdmin && onRefresh && (
            <button style={styles.refreshBtn} onClick={() => onRefresh(yacht)}>↻ Refresh availability</button>
          )}
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'flex', gap: 4, minWidth: 560 }}>
          {allMonths.map(({ label, weeks, monthNum }) => (
            <div key={monthNum} style={{ flex: 1, minWidth: 0 }}>
              <div style={styles.monthLabel}>{label}</div>
              <div>
                {weeks.map((wStart, wi) => (
                  <WeekCell
                    key={wi}
                    wStart={wStart}
                    bookings={bookings}
                    onSelect={handleSelect}
                    isSelected={selectedWeek && selectedWeek.start.getTime() === wStart.getTime()}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={styles.legend}>
        <div style={styles.legendItem}><div style={{ ...styles.legendDot, background: '#d1fae5' }} />Available</div>
        <div style={styles.legendItem}><div style={{ ...styles.legendDot, background: '#fee2e2' }} />Booked</div>
        <div style={styles.legendItem}><div style={{ ...styles.legendDot, background: '#fef3c7' }} />Option</div>
      </div>
    </div>
  );
}
