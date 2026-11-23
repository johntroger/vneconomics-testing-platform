import type {
  AttendanceRecord,
  AttendanceSession,
  AttendanceSessionStats,
} from '../types/attendance';

export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a))));
}

export function computeHardwareFingerprint(): string {
  try {
    const raw = [
      window.screen?.width ?? 0,
      window.screen?.height ?? 0,
      window.devicePixelRatio ?? 1,
      navigator.hardwareConcurrency ?? 0,
      navigator.platform ?? '',
      Intl.DateTimeFormat().resolvedOptions().timeZone ?? '',
    ].join('|');
    let hash = 2166136261;
    for (let i = 0; i < raw.length; i += 1) {
      hash ^= raw.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `hw_${(hash >>> 0).toString(16)}`;
  } catch {
    return 'hw_unknown';
  }
}

export function computeSessionStats(records: AttendanceRecord[]): AttendanceSessionStats {
  const stats: AttendanceSessionStats = {
    total: records.length,
    present: 0,
    late: 0,
    excused: 0,
    unexcused: 0,
    alerts: 0,
  };
  for (const r of records) {
    if (r.attendanceStatus === 'PRESENT') stats.present += 1;
    else if (r.attendanceStatus === 'LATE') stats.late += 1;
    else if (r.attendanceStatus === 'ABSENT_EXCUSED') stats.excused += 1;
    else stats.unexcused += 1;
    if (r.deviceFlag || r.locationFlag) stats.alerts += 1;
  }
  return stats;
}

export function recalculateSessionDistances(
  session: AttendanceSession,
  records: AttendanceRecord[],
): AttendanceRecord[] {
  let centerLat = session.instructorLat;
  let centerLng = session.instructorLng;
  if (centerLat === null || centerLng === null) {
    const located = records.filter(
      (r) => typeof r.locationLat === 'number' && typeof r.locationLng === 'number',
    );
    if (located.length >= 3) {
      const lats = located.map((r) => r.locationLat as number).sort((a, b) => a - b);
      const lngs = located.map((r) => r.locationLng as number).sort((a, b) => a - b);
      const mid = Math.floor(lats.length / 2);
      centerLat = lats[mid];
      centerLng = lngs[mid];
    }
  }

  return records.map((r) => {
    if (r.locationLat === null || r.locationLng === null) {
      return {
        ...r,
        distanceMeters: null,
        locationFlag: r.checkInSource === 'QR_SCAN' ? 'NO_GPS' : null,
      };
    }
    if (centerLat === null || centerLng === null) {
      return { ...r, distanceMeters: 0, locationFlag: null };
    }
    const dist = haversineMeters(centerLat, centerLng, r.locationLat, r.locationLng);
    const acc = r.locationAccuracy ?? 0;
    const effective = Math.max(0, dist - Math.min(Math.round(acc), 150));
    return {
      ...r,
      distanceMeters: dist,
      locationFlag: effective > (session.maxDistanceMeters || 200) ? 'FAR_LOCATION' : null,
    };
  });
}
