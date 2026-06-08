type CountdownRingProps = {
  seconds: number;
  progress: number;
};

export function CountdownRing({ seconds, progress }: CountdownRingProps) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);

  return (
    <div className="countdown" aria-label={`${seconds} seconds remaining`}>
      <svg viewBox="0 0 44 44" aria-hidden="true">
        <circle className="countdown__track" cx="22" cy="22" r={radius} />
        <circle
          className="countdown__bar"
          cx="22"
          cy="22"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <span>{seconds}</span>
    </div>
  );
}
