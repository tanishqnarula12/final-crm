// Chat avatars — profile photo when set, coloured initials otherwise.
import { Users } from 'lucide-react';
import { avatarColor, initials } from '../../utils/calc';

export function ChatAvatar({ user, size = 40, online = false }) {
  const name = user?.name || '?';
  const px = { width: size, height: size, fontSize: Math.round(size * 0.34) };
  return (
    <div className="relative shrink-0">
      {user?.photo ? (
        <img src={user.photo} alt={name} style={px} className="rounded-full object-cover" />
      ) : (
        <div style={px} className={`${avatarColor(name)} rounded-full flex items-center justify-center text-white font-bold`}>
          {initials(name)}
        </div>
      )}
      {online && (
        <span
          style={{ width: Math.max(9, size * 0.26), height: Math.max(9, size * 0.26) }}
          className="absolute bottom-0 right-0 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900"
        />
      )}
    </div>
  );
}

export function GroupAvatar({ size = 40, photo = '' }) {
  if (photo) {
    return (
      <img
        src={photo}
        alt="Group"
        style={{ width: size, height: size }}
        className="rounded-full object-cover shrink-0"
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white shrink-0 shadow-sm"
    >
      <Users size={Math.round(size * 0.45)} />
    </div>
  );
}
