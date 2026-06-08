type DebugFunction = ((...args: unknown[]) => void) & {
  enabled: boolean;
  extend: (namespace: string) => DebugFunction;
};

type DebugFactory = ((namespace: string) => DebugFunction) & {
  disable: () => string;
  enable: (namespaces: string) => void;
  enabled: (namespace: string) => boolean;
  formatters: Record<string, (value: unknown) => string>;
};

function createDebugFunction(): DebugFunction {
  const debugFunction = (() => undefined) as DebugFunction;
  debugFunction.enabled = false;
  debugFunction.extend = () => debugFunction;
  return debugFunction;
}

const debug = ((() => createDebugFunction()) as unknown) as DebugFactory;

debug.disable = () => "";
debug.enable = () => undefined;
debug.enabled = () => false;
debug.formatters = {};

export default debug;
