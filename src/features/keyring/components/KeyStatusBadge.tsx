import React, { useEffect, useState } from 'react';
import { ApiKeyRecord } from '../../../types';
import { Badge } from '../../../components/ui/badge';
import { AlertCircle, CheckCircle2, Clock, ShieldAlert, Slash } from 'lucide-react';

interface Props {
  keyRecord: ApiKeyRecord;
}

export const KeyStatusBadge: React.FC<Props> = ({ keyRecord }) => {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(0);

  useEffect(() => {
    if (keyRecord.status === 'cooling_down' && keyRecord.cooldownUntil) {
      const update = () => {
        const remaining = Math.max(0, Math.ceil((keyRecord.cooldownUntil! - Date.now()) / 1000));
        setSecondsRemaining(remaining);
      };
      update();
      const interval = setInterval(update, 1000);
      return () => clearInterval(interval);
    } else {
      setSecondsRemaining(0);
    }
  }, [keyRecord.status, keyRecord.cooldownUntil]);

  switch (keyRecord.status) {
    case 'healthy':
      return (
        <Badge variant="success" className="gap-1 font-mono">
          <CheckCircle2 className="w-3 h-3" />
          Ready
          {keyRecord.lastLatencyMs ? (
            <span className="opacity-75">({keyRecord.lastLatencyMs}ms)</span>
          ) : null}
        </Badge>
      );

    case 'cooling_down':
      return (
        <Badge variant="warning" className="gap-1 font-mono animate-pulse">
          <Clock className="w-3 h-3" />
          Cooldown {secondsRemaining > 0 ? `${secondsRemaining}s` : ''}
        </Badge>
      );

    case 'exhausted_daily':
      return (
        <Badge variant="destructive" className="gap-1 font-mono">
          <AlertCircle className="w-3 h-3" />
          Quota Limit (24h)
        </Badge>
      );

    case 'invalid':
      return (
        <Badge
          variant="destructive"
          className="gap-1 font-mono cursor-help"
          title={keyRecord.lastError || 'Key invalid'}
        >
          <ShieldAlert className="w-3 h-3" />
          Invalid
        </Badge>
      );

    case 'disabled':
      return (
        <Badge variant="secondary" className="gap-1 font-mono">
          <Slash className="w-3 h-3" />
          Disabled
        </Badge>
      );

    default:
      return null;
  }
};
