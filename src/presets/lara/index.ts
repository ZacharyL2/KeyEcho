import global from './global';

function convertGlobToRegex(globPattern: string) {
  const regexPattern = globPattern.replace(/\./g, '\\.').replace(/\*/g, '(.+)');
  return new RegExp(`${regexPattern}$`);
}

function getGlobData(globRegex: RegExp, globObj: object) {
  const data = Object.entries(globObj).reduce(
    (acc, [path, value]) => {
      const key = path.match(globRegex)?.at(1);
      if (key) {
        acc[key] = value;
      }
      return acc;
    },
    Object.create(null) as Record<string, object>,
  );

  return data;
}

const config = {
  ...getGlobData(
    convertGlobToRegex('./components/*.ts'),
    import.meta.glob('./components/*.ts', {
      eager: true,
      import: 'default',
    }),
  ),

  directives: getGlobData(
    convertGlobToRegex('./directives/*.ts'),
    import.meta.glob('./directives/*.ts', {
      eager: true,
      import: 'default',
    }),
  ),

  global,
};

export default config;
