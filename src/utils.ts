export const calculateDependenciesCount = (
  arr: Array<{ tag: string; dependencies?: Array<string> }>,
  tag: string,
  initialTag: string,
): { deps: Array<string>; deep: number } => {
  if (arr.length === 0) {
    return { deep: 0, deps: [] };
  }

  const searchedEl = arr.find((el) => el.tag === tag);
  if (!searchedEl) {
    return { deep: 0, deps: [] };
  }
  if (!searchedEl.dependencies) {
    return { deep: 0, deps: [] };
  }
  return searchedEl.dependencies.reduce(
    (acc, next) => {
      if (initialTag === next) {
        throw new Error(`The tag can't depend on self, tag: ${initialTag}, conflict with ${searchedEl.tag}`);
      }
      const { deps, deep } = calculateDependenciesCount(arr, next, initialTag);
      return {
        deps: [...acc.deps, ...deps],
        deep: acc.deep + deep + 1,
      };
    },
    { deep: 0, deps: (searchedEl.dependencies || []) as Array<string> },
  );
};
export const isT = <T>(p: T): p is NonNullable<T> => !!p;
