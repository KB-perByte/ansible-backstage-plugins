export interface Config {
  ansible?: {
    portal?: {
      onboarding?: {
        /**
         * Whether the setup wizard is shown on first boot.
         * @default false
         * @visibility frontend
         */
        enabled?: boolean;
      };
    };
  };
}
