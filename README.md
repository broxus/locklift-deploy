# Plugin integration documentation


## Development of a plugin
run ```npm i``` inside this repo

In this boilerplate we can find two file `index.ts` and `type-extentions.ts`

### Inside the `index.ts` we are calling function `addPlugin` that obtain some parameters
#### `pluginName` your plugin name that should be defined in `type-extentions.ts` as `PLUGIN_NAME`
#### `initializer` function will be called by locklift when it will be initialized
This is core plugin function that provides `locklift` instance, selected `network` and `config` object.
This function should return an instance of your plugin implementation `Promise<TEST_PLUGIN>` like in the example.
After it the plugin consumer(user) will have access to your plugin instance inside the CLI and Typescript


#### `commandBuilders` array of custom CLI commands
This is an Array of objects
```typescript
Array<{
    commandCreator: (command: commander.Command) => commander.Command;
    skipSteps?: {
      build?: boolean;
    };
  }>
```
#### `commandCreator`
This is a function that accepting `command` instance that you can [configure](https://www.npmjs.com/package/commander#commands) as you want.
Also, each command have predefined params like `contracts`, `build`, `network`, `config` and `script`, so you shouldn't provide it again in your plugin.
Inside `action` function you will get all command params and `locklift` instance (see an example)
#### `skipSteps` configuration of force skipping some steps
Lockilft by default runs the build process, if you command don't need this process you can override current behavior by setting `{build: false}`

### Inside the `type-extentions.ts` we are:
1. overriding types for `Locklift`(extending Locklift).
2. overriding types for `LockliftConfig`(extending locklift.config object).
3. change name of our plugin `export const PLUGIN_NAME = "samplePlugin"` this constant used in type overriding and as plugin name inside the `add plugin` function,
and will be used as access to this plugin inside the locklift project e.g. `console.log(locklift.samplePlugin.getGreeting());`

## Using plugin inside a locklift project
1. Plugin should be installed in the locklift project
2. Plugin should be imported inside the `locklift.config.ts` like this `import "sample-plugin";`
3. Define custom fields in `locklift.config.ts` if it needed.

### CLI usage
Then user can use it via cli 
```shell
npx locklift -h
```
```shell
Usage: cli [options] [command]

Options:
  -V, --version           output the version number
  -h, --help              display help for command

Commands:
  init [options]          Initialize sample Locklift project in a directory
  test [options]          Run mocha tests
  build [options]         Build contracts by using Ever Solidity compiler and TVM linker
  run [options]           Run arbitrary locklift script
  TEST_COMMAND [options]
  getcode [options]
  get-greeting [options]
  help [command]          display help for command
```
as you can see inside the help there are some new commands that was provided by our plugin.

Let's use `getcode` method
```shell
npx locklift getcode -n local --contract MyContarctName
```
output(cut):
```shell
te6ccgEC...AAAEA==
```
### Typescript usage
In `type-extensions.ts` we have already overridden types for `Locklift`, so a user will see our plugin inside the `locklift` object, and interact with it like this
```typescript
console.log(locklift.samplePlugin.getGreeting());
```

## Local development
1. Initialize new locklift project inside any folder e.g. `./my_project/plugin_development_project`
2. Define this boilerplate inside another folder e.g. `./my_project/my_plugin`, and change project name inside `package.json` e.g. `my-plugin`
3. Inside the plugin folder build and link the plugin `npm run build && npm link`
4. Go to locklift project and link your plugin `npm link my-plugin`


