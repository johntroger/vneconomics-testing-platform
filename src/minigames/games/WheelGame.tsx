import React from 'react';
import { WheelEngine } from '../engines/WheelEngine';
import type { MinigameProps } from '../types';

export const WheelGame: React.FC<MinigameProps> = ({
  students,
  muted,
  onPickStudent,
}) => {
  return (
    <WheelEngine
      students={students}
      muted={muted}
      title="Vòng quay Kỳ diệu — Bấm QUAY NGAY để chọn sinh viên lên bảng"
      centerEmoji="🎯"
      onPickStudent={onPickStudent}
    />
  );
};

export default WheelGame;
