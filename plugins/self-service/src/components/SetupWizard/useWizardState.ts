import { useState, useCallback } from 'react';
import type {
  AAPConfig,
  RegistriesConfig,
  SCMConfig,
} from '@ansible/backstage-rhaap-common';

export type WizardStep =
  | 'overview'
  | 'aap'
  | 'registries'
  | 'source-control'
  | 'review';

const STEPS: WizardStep[] = [
  'overview',
  'aap',
  'registries',
  'source-control',
  'review',
];

export const STEP_LABELS: Record<WizardStep, string> = {
  overview: 'Overview',
  aap: 'Connect AAP',
  registries: 'Connect Registries',
  'source-control': 'Connect Source Control',
  review: 'Review',
};

export interface WizardState {
  currentStep: number;
  aap: Partial<AAPConfig>;
  registries: Partial<RegistriesConfig>;
  scm: Record<string, Partial<SCMConfig>>;
  isApplying: boolean;
  isComplete: boolean;
  error: string | null;
}

const initialState: WizardState = {
  currentStep: 0,
  aap: {},
  registries: {
    pahEnabled: true,
    pahInheritAap: true,
    certifiedContent: true,
    validatedContent: true,
    galaxyEnabled: true,
  },
  scm: {},
  isApplying: false,
  isComplete: false,
  error: null,
};

export function useWizardState() {
  const [state, setState] = useState<WizardState>(initialState);

  const currentStepName = STEPS[state.currentStep];

  const goNext = useCallback(() => {
    setState(prev => ({
      ...prev,
      currentStep: Math.min(prev.currentStep + 1, STEPS.length - 1),
      error: null,
    }));
  }, []);

  const goBack = useCallback(() => {
    setState(prev => ({
      ...prev,
      currentStep: Math.max(prev.currentStep - 1, 0),
      error: null,
    }));
  }, []);

  const goToStep = useCallback((step: number) => {
    setState(prev => ({
      ...prev,
      currentStep: Math.max(0, Math.min(step, STEPS.length - 1)),
      error: null,
    }));
  }, []);

  const setAAPConfig = useCallback((config: Partial<AAPConfig>) => {
    setState(prev => ({ ...prev, aap: { ...prev.aap, ...config } }));
  }, []);

  const setRegistriesConfig = useCallback(
    (config: Partial<RegistriesConfig>) => {
      setState(prev => ({
        ...prev,
        registries: { ...prev.registries, ...config },
      }));
    },
    [],
  );

  const setSCMConfig = useCallback(
    (provider: string, config: Partial<SCMConfig>) => {
      setState(prev => ({
        ...prev,
        scm: {
          ...prev.scm,
          [provider]: { ...prev.scm[provider], ...config },
        },
      }));
    },
    [],
  );

  const removeSCMConfig = useCallback((provider: string) => {
    setState(prev => {
      const { [provider]: _, ...rest } = prev.scm;
      return { ...prev, scm: rest };
    });
  }, []);

  const setApplying = useCallback((applying: boolean) => {
    setState(prev => ({ ...prev, isApplying: applying }));
  }, []);

  const setComplete = useCallback(() => {
    setState(prev => ({ ...prev, isComplete: true, isApplying: false }));
  }, []);

  const setError = useCallback((error: string | null) => {
    setState(prev => ({ ...prev, error }));
  }, []);

  return {
    state,
    currentStepName,
    steps: STEPS,
    stepLabels: STEP_LABELS,
    goNext,
    goBack,
    goToStep,
    setAAPConfig,
    setRegistriesConfig,
    setSCMConfig,
    removeSCMConfig,
    setApplying,
    setComplete,
    setError,
  };
}
