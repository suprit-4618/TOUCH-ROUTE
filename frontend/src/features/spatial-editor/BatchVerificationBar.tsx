import React, { useState } from 'react';
import { CheckCircle2, ShieldCheck, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { useAccessibility } from '../../context/AccessibilityContext';

interface BatchVerificationBarProps {
  totalNodes: number;
  verifiedNodes: number;
  geometryValidatedNodes: number;
  onVerifyGeometryValidated: () => Promise<void>;
  onVerifyAll: () => Promise<void>;
  disabled?: boolean;
}

export const BatchVerificationBar: React.FC<BatchVerificationBarProps> = ({
  totalNodes,
  verifiedNodes,
  geometryValidatedNodes,
  onVerifyGeometryValidated,
  onVerifyAll,
  disabled = false,
}) => {
  const { announce, playFeedbackTone } = useAccessibility();
  const [loadingAction, setLoadingAction] = useState<'geo' | 'all' | null>(null);

  const percent = totalNodes > 0 ? Math.round((verifiedNodes / totalNodes) * 100) : 0;
  const unverifiedCount = totalNodes - verifiedNodes;

  const handleVerifyGeo = async () => {
    try {
      setLoadingAction('geo');
      await onVerifyGeometryValidated();
      playFeedbackTone('success');
      announce(`Geometry-validated elements verified.`);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleVerifyAll = async () => {
    if (!window.confirm('Confirm all spatial elements on this floor as verified navigation waypoints?')) return;
    try {
      setLoadingAction('all');
      await onVerifyAll();
      playFeedbackTone('success');
      announce('All spatial elements verified for accessible navigation.');
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Verification Progress Info */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {percent === 100 ? (
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-zinc-800 shrink-0" />
            )}
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-700">
              Safety Verification Status: {percent}% Ready
            </span>
          </div>
          <p className="text-xs text-zinc-600">
            <strong className="text-zinc-900">{verifiedNodes}</strong> of{' '}
            <strong className="text-zinc-900">{totalNodes}</strong> spatial elements verified for
            safe navigation.
            {unverifiedCount > 0 && (
              <span className="text-zinc-900 ml-1">
                ({unverifiedCount} unverified {unverifiedCount === 1 ? 'element' : 'elements'} excluded from public routing)
              </span>
            )}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {geometryValidatedNodes > 0 && (
            <Button
              variant="outline"
              size="sm"
              disabled={disabled || loadingAction !== null}
              onClick={handleVerifyGeo}
              icon={
                loadingAction === 'geo' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                )
              }
              className="text-xs"
            >
              Verify Validated ({geometryValidatedNodes})
            </Button>
          )}

          {unverifiedCount > 0 && (
            <Button
              variant="primary"
              size="sm"
              disabled={disabled || loadingAction !== null}
              onClick={handleVerifyAll}
              icon={
                loadingAction === 'all' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ShieldCheck className="w-3.5 h-3.5 text-zinc-400" />
                )
              }
              className="text-xs"
            >
              Verify All on Floor
            </Button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-3 w-full bg-zinc-100 rounded-full h-1.5 overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${
            percent === 100 ? 'bg-emerald-600' : 'bg-zinc-900'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
};

