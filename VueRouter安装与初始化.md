Vue-Router版本3.1.6

## Vue.use

`Vue.use`是路由安装需要执行的方法，源码：

```javascript
Vue.use = function (plugin: Function | Object) {
    const installedPlugins = (this._installedPlugins || (this._installedPlugins = []))
    if (installedPlugins.indexOf(plugin) > -1) {
      return this
    }

    // additional parameters
    const args = toArray(arguments, 1)
    args.unshift(this)
    if (typeof plugin.install === 'function') {
      plugin.install.apply(plugin, args)
    } else if (typeof plugin === 'function') {
      plugin.apply(null, args)
    }
    installedPlugins.push(plugin)
    return this
}
```

这个方法的作用就是，先获取所有安装过的插件，如果传入的插件安装过，直接`return`。然后将`Vue`这个对象传入插件作为其第一个参数，执行安装，最后将新安装的插件`push`到`installedPlugins`中。

## VueRouter.install

路由安装过程，`VueRouter.install`源码：

```javascript
export let _Vue

export function install (Vue) {
  if (install.installed && _Vue === Vue) return
  install.installed = true

  _Vue = Vue

  const isDef = v => v !== undefined

  const registerInstance = (vm, callVal) => {
    let i = vm.$options._parentVnode
    if (isDef(i) && isDef(i = i.data) && isDef(i = i.registerRouteInstance)) {
      i(vm, callVal)
    }
  }

  Vue.mixin({
    beforeCreate () {
      if (isDef(this.$options.router)) {
        this._routerRoot = this
        this._router = this.$options.router
        this._router.init(this)
        Vue.util.defineReactive(this, '_route', this._router.history.current)
      } else {
        this._routerRoot = (this.$parent && this.$parent._routerRoot) || this
      }
      registerInstance(this, this)
    },
    destroyed () {
      registerInstance(this)
    }
  })

  Object.defineProperty(Vue.prototype, '$router', {
    get () { return this._routerRoot._router }
  })

  Object.defineProperty(Vue.prototype, '$route', {
    get () { return this._routerRoot._route }
  })

  Vue.component('RouterView', View)
  Vue.component('RouterLink', Link)

  const strats = Vue.config.optionMergeStrategies
  // use the same hook merging strategy for route hooks
  strats.beforeRouteEnter = strats.beforeRouteLeave = strats.beforeRouteUpdate = 		strats.created
}
```

安装路由的过程，首先设置`install.installed = true`，并且设置`_Vue = Vue`，这么做的目的是防止重复安装，接着定义了注册组件实例的函数`registerInstance`，执行`Vue.mixin`全局混入2个钩子函数，执行`Object.defineProperty`向`Vue`原型添加了`$router`和`$route`这2个属性，执行`Vue.component`全局注册`RouterView`和`RouterLink`2组件。

## new VueRouter

初始化`VueRouter`，`VueRouter`源码：

```javascript
export default class VueRouter {
  static install: () => void;
  static version: string;

  app: any;
  apps: Array<any>;
  ready: boolean;
  readyCbs: Array<Function>;
  options: RouterOptions;
  mode: string;
  history: HashHistory | HTML5History | AbstractHistory;
  matcher: Matcher;
  fallback: boolean;
  beforeHooks: Array<?NavigationGuard>;
  resolveHooks: Array<?NavigationGuard>;
  afterHooks: Array<?AfterNavigationHook>;

  constructor (options: RouterOptions = {}) {
    this.app = null
    this.apps = []
    this.options = options
    this.beforeHooks = []
    this.resolveHooks = []
    this.afterHooks = []
    this.matcher = createMatcher(options.routes || [], this)

    let mode = options.mode || 'hash'
    this.fallback = mode === 'history' && !supportsPushState && options.fallback !== false
    if (this.fallback) {
      mode = 'hash'
    }
    if (!inBrowser) {
      mode = 'abstract'
    }
    this.mode = mode

    switch (mode) {
      case 'history':
        this.history = new HTML5History(this, options.base)
        break
      case 'hash':
        this.history = new HashHistory(this, options.base, this.fallback)
        break
      case 'abstract':
        this.history = new AbstractHistory(this, options.base)
        break
      default:
        if (process.env.NODE_ENV !== 'production') {
          assert(false, `invalid mode: ${mode}`)
        }
    }
  }

  // ...
}
```

`new VueRouter`执行的是它的`constructor`方法。初始化各种变量，接着对`mode`做处理，获取配置中的`mode`属性，没有配置的情况下，默认为`hash`模式，如果配置`mode`为`history`，会对其做判断，如果浏览器不支持，会降级为`hash`模式，`this.history`这个变量会根据`mode`属性生成不同的`History`。

### matcher

`new VueRouter`会初始化`this.matcher`变量，这个变量是路由配置的映射，它是执行`createMatcher`后返回的，源码：

```javascript
export type Matcher = {
  match: (raw: RawLocation, current?: Route, redirectedFrom?: Location) => Route;
  addRoutes: (routes: Array<RouteConfig>) => void;
};

export function createMatcher (
  routes: Array<RouteConfig>,
  router: VueRouter
): Matcher {
  const { pathList, pathMap, nameMap } = createRouteMap(routes)

  function addRoutes (routes) {
    createRouteMap(routes, pathList, pathMap, nameMap)
  }

  function match (
    raw: RawLocation,
    currentRoute?: Route,
    redirectedFrom?: Location
  ): Route {...}

  function redirect (
    record: RouteRecord,
    location: Location
  ): Route {...}

  function alias (
    record: RouteRecord,
    location: Location,
    matchAs: string
  ): Route {...}

  function _createRoute (
    record: ?RouteRecord,
    location: Location,
    redirectedFrom?: Location
  ): Route {...}

  return {
    match,
    addRoutes
  }
}
```

`Matcher`是一个对象，包含了`match`和`addRoutes`2个方法。`createMatcher`方法首先执行`createRouteMap`方法，然后定义 了一些函数，最后返回`Matcher`。`createRouteMap`源码：

```javascript
export function createRouteMap (
  routes: Array<RouteConfig>,
  oldPathList?: Array<string>,
  oldPathMap?: Dictionary<RouteRecord>,
  oldNameMap?: Dictionary<RouteRecord>
): {
  pathList: Array<string>,
  pathMap: Dictionary<RouteRecord>,
  nameMap: Dictionary<RouteRecord>
} {
  // the path list is used to control path matching priority
  const pathList: Array<string> = oldPathList || []
  // $flow-disable-line
  const pathMap: Dictionary<RouteRecord> = oldPathMap || Object.create(null)
  // $flow-disable-line
  const nameMap: Dictionary<RouteRecord> = oldNameMap || Object.create(null)

  routes.forEach(route => {
    addRouteRecord(pathList, pathMap, nameMap, route)
  })

  // ensure wildcard routes are always at the end
  for (let i = 0, l = pathList.length; i < l; i++) {
    if (pathList[i] === '*') {
      pathList.push(pathList.splice(i, 1)[0])
      l--
      i--
    }
  }
  
  if (process.env.NODE_ENV === 'development') {...}

  return {
    pathList,
    pathMap,
    nameMap
  }
}
```

该方法会定义3个变量，分别是`pathList`，`pathMap`，`nameMap`，然后遍历路由配置`routes`，依次执行`addRouteRecord(pathList, pathMap, nameMap, route)`，最后返回这3个变量。

`pathList`是存储所有路由配置的`path`，`pathMap`是路由配置中所有`path`所对应的`RouteRecord`，`nameMap`是路由配置中所有`name`所对应的`RouteRecord`。

`RouteRecord`是路由配置中每一个路由的记录，是执行`addRouteRecord`所创建的，源码：

```javascript
function addRouteRecord (
  pathList: Array<string>,
  pathMap: Dictionary<RouteRecord>,
  nameMap: Dictionary<RouteRecord>,
  route: RouteConfig,
  parent?: RouteRecord,
  matchAs?: string
) {
  const { path, name } = route
  if (process.env.NODE_ENV !== 'production') {...}
  
  const pathToRegexpOptions: PathToRegexpOptions =
    route.pathToRegexpOptions || {}
  const normalizedPath = normalizePath(path, parent, pathToRegexpOptions.strict)

  if (typeof route.caseSensitive === 'boolean') {
    pathToRegexpOptions.sensitive = route.caseSensitive
  }

  const record: RouteRecord = {
    path: normalizedPath,
    regex: compileRouteRegex(normalizedPath, pathToRegexpOptions),
    components: route.components || { default: route.component },
    instances: {},
    name,
    parent,
    matchAs,
    redirect: route.redirect,
    beforeEnter: route.beforeEnter,
    meta: route.meta || {},
    props:
      route.props == null
        ? {}
        : route.components
          ? route.props
          : { default: route.props }
  }

  if (route.children) {
    // Warn if route is named, does not redirect and has a default child route.
    // If users navigate to this route by name, the default child will
    // not be rendered (GH Issue #629)
    if (process.env.NODE_ENV !== 'production') {...}
    route.children.forEach(child => {
      const childMatchAs = matchAs
        ? cleanPath(`${matchAs}/${child.path}`)
        : undefined
      addRouteRecord(pathList, pathMap, nameMap, child, record, childMatchAs)
    })
  }

  if (!pathMap[record.path]) {
    pathList.push(record.path)
    pathMap[record.path] = record
  }

  if (route.alias !== undefined) {...}

  if (name) {
    if (!nameMap[name]) {
      nameMap[name] = record
    } else if (process.env.NODE_ENV !== 'production' && !matchAs) {...}
  }
}
```

该方法的主要作用就是创建的`RouteRecord`，并且向`pathList`，`pathMap`，`nameMap`这3个变量中分别添加`route`对应的`path`以及`RouteRecord`，如果路由中存在子路由，那么会递归调用`addRouteRecord`。

`RouteRecord`的`path`是根据`parent`的`path`通过执行`normalizePath`计算得出的，`regex`是通过`path-to-regexp`工具生成的一个正则，如果`normalizedPath`中带有`params`，类似`/index/:foo/:bar`，解析的正则带有一个`keys`的数组里会存放这2个`params`的`key`以及其他属性的对象，`components`存放的是组件，`instances`存放的组件的实例，`parent`是父`RecordRoute`。

+ RotueRecord
```javascript
declare type RouteRecord = {
  path: string;
  regex: RouteRegExp;
  components: Dictionary<any>;
  instances: Dictionary<any>;
  name: ?string;
  parent: ?RouteRecord;
  redirect: ?RedirectOption;
  matchAs: ?string;
  beforeEnter: ?NavigationGuard;
  meta: any;
  props: boolean | Object | Function | Dictionary<boolean | Object | Function>;
}
```

回到`VueRouter`的`constructor`，去初始化`VueRouter`的`history`，这个属性是根据`mode`进行不同的初始化，默认的是`hash`，那么就会执行`new HashHistory(this, options.base, this.fallback)`，源码：

```javascript
export class HashHistory extends History {
  constructor (router: Router, base: ?string, fallback: boolean) {
    super(router, base)
    // check history fallback deeplinking
    if (fallback && checkFallback(this.base)) {
      return
    }
    ensureSlash()
  }

  // this is delayed until the app mounts
  // to avoid the hashchange listener being fired too early
  setupListeners () {...}

  push (location: RawLocation, onComplete?: Function, onAbort?: Function) {...}

  replace (location: RawLocation, onComplete?: Function, onAbort?: Function) {...}

  go (n: number) {...}

  ensureURL (push?: boolean) {...}

  getCurrentLocation () {...}
}
```

`HashHistory`继承了`History`，执行了`super`并执行了`ensureSlash`。`hash`模式下，访问`localhost`时会被添加上`/#/`，`url`变为`localhost/#/`，`ensureSlash`就是做了这件事。

`History`源码：

```javascript
export class History {
  router: Router
  base: string
  current: Route
  pending: ?Route
  cb: (r: Route) => void
  ready: boolean
  readyCbs: Array<Function>
  readyErrorCbs: Array<Function>
  errorCbs: Array<Function>

  // implemented by sub-classes
  +go: (n: number) => void
  +push: (loc: RawLocation) => void
  +replace: (loc: RawLocation) => void
  +ensureURL: (push?: boolean) => void
  +getCurrentLocation: () => string

  constructor (router: Router, base: ?string) {
    this.router = router
    this.base = normalizeBase(base)
    // start with a route object that stands for "nowhere"
    this.current = START
    this.pending = null
    this.ready = false
    this.readyCbs = []
    this.readyErrorCbs = []
    this.errorCbs = []
  }

  listen (cb: Function) {
    this.cb = cb
  }

  onReady (cb: Function, errorCb: ?Function) {...}

  onError (errorCb: Function) {...}

  transitionTo (
    location: RawLocation,
    onComplete?: Function,
    onAbort?: Function
  ) {...}

  confirmTransition (route: Route, onComplete: Function, onAbort?: Function) {...}

  updateRoute (route: Route) {...}
}
                                                                              
const START = createRoute(null, {
  path: '/'
})
```

执行`super`就是执行了`History`的`constructor`，初始化`this.current`是`START`，它的作用是第一次`transitrionTo`时会用到，至此`VueRouter`的安装和初始化结束。
