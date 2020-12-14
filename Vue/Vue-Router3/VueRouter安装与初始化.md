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

### match

```javascript
function match (
    raw: RawLocation,
    currentRoute?: Route,
    redirectedFrom?: Location
  ): Route {
    const location = normalizeLocation(raw, currentRoute, false, router)
    const { name } = location

    
    if (name) {
      const record = nameMap[name]
      if (process.env.NODE_ENV !== 'production') {
        warn(record, `Route with name '${name}' does not exist`)
      }
      if (!record) return _createRoute(null, location)
          const paramNames = record.regex.keys
        .filter(key => !key.optional)
        .map(key => key.name)

      if (typeof location.params !== 'object') {
        location.params = {}
      }

      if (currentRoute && typeof currentRoute.params === 'object') {
        for (const key in currentRoute.params) {
          if (!(key in location.params) && paramNames.indexOf(key) > -1) {
            location.params[key] = currentRoute.params[key]
          }
        }
      }

      location.path = fillParams(record.path, location.params, `named route "${name}"`)
      return _createRoute(record, location, redirectedFrom)
    } else if (location.path) {
      location.params = {}
      for (let i = 0; i < pathList.length; i++) {
        const path = pathList[i]
        const record = pathMap[path]
        if (matchRoute(record.regex, location.path, location.params)) {
          return _createRoute(record, location, redirectedFrom)
        }
      }
    }
    // no match
    return _createRoute(null, location)
}
```

`match`是`Matcher`的一个方法，它的作用是根据传入的`raw`也就是目标路径的`Location`和当前路径的`Route`计算出新的`Route`。

+ Location

```javascript
declare type Location = {
  _normalized?: boolean;
  name?: string;
  path?: string;
  hash?: string;
  query?: Dictionary<string>;
  params?: Dictionary<string>;
  append?: boolean;
  replace?: boolean;
}

declare type RawLocation = string | Location
```

`Location`是对`path`的结构化描述。

+ Route

```javasc
declare type Route = {
  path: string;
  name: ?string;
  hash: string;
  query: Dictionary<string>;
  params: Dictionary<string>;
  fullPath: string;
  matched: Array<RouteRecord>;
  redirectedFrom?: string;
  meta?: any;
}
```

`Route`也是对`path`的结构化描述，`matched`是`Route`一条线路上的所有的`RouteRecord`，举个例子：

```javascript
[
    {
        path: '/foo'
        component: Foo,
        children: [
        	{
        		path: 'bar',
        		component: Bar,
        		children: [
        			{
        				path: 'baz',
        				component: Baz
    				}
        		]
    		}
        ]
    }
]
```

路由`/foo/bar/baz`的`matched`就是`[baz的RouteRecord, bar的RouteRecord，foo的RouteRecord]`。

首先会执行`normalizeLocation`计算出新的`Location`，源码：

```javascript
export function normalizeLocation (
  raw: RawLocation,
  current: ?Route,
  append: ?boolean,
  router: ?VueRouter
): Location {
  let next: Location = typeof raw === 'string' ? { path: raw } : raw
  // named target
  if (next._normalized) {
    return next
  } else if (next.name) {
    next = extend({}, raw)
    const params = next.params
    if (params && typeof params === 'object') {
      next.params = extend({}, params)
    }
    return next
  }

  // relative params
  if (!next.path && next.params && current) {
    next = extend({}, next)
    next._normalized = true
    const params: any = extend(extend({}, current.params), next.params)
    if (current.name) {
      next.name = current.name
      next.params = params
    } else if (current.matched.length) {
      const rawPath = current.matched[current.matched.length - 1].path
      next.path = fillParams(rawPath, params, `path ${current.path}`)
    } else if (process.env.NODE_ENV !== 'production') {
      warn(false, `relative params navigation requires a current route.`)
    }
    return next
  }

  const parsedPath = parsePath(next.path || '')
  const basePath = (current && current.path) || '/'
  const path = parsedPath.path
    ? resolvePath(parsedPath.path, basePath, append || next.append)
    : basePath

  const query = resolveQuery(
    parsedPath.query,
    next.query,
    router && router.options.parseQuery
  )

  let hash = next.hash || parsedPath.hash
  if (hash && hash.charAt(0) !== '#') {
    hash = `#${hash}`
  }

  return {
    _normalized: true,
    path,
    query,
    hash
  }
}
```

首先根据传入的`raw`初始化`next`，如果`next._normalized`为`true`说明已经是计算过的`Location`，直接返回。如果`next.name`有值，那么会获取`next.params`，有值的情况，进行一次拷贝，然后重新赋值给`next.params`并返回。如果上面2个逻辑都没有命中，那么会计算新的`Location`，这个新的`Location`分2种情况：

+ 有`path`

有`path`的情况下，首先会执行`parsePath(next.path)`，源码：
```javascript
export function parsePath (path: string): {
  path: string;
  query: string;
  hash: string;
} {
  let hash = ''
  let query = ''

  const hashIndex = path.indexOf('#')
  if (hashIndex >= 0) {
    hash = path.slice(hashIndex)
    path = path.slice(0, hashIndex)
  }

  const queryIndex = path.indexOf('?')
  if (queryIndex >= 0) {
    query = path.slice(queryIndex + 1)
    path = path.slice(0, queryIndex)
  }

  return {
    path,
    query,
    hash
  }
}
```

该函数会解析出目标路径的`query`和`hash`以及`path`。然后获取当前`Route`的`path`，根据这个`path`和解析出的`parsePath`执行`resolvePath`计算出新的`path`，源码：

```javascript
export function resolvePath (
  relative: string,
  base: string,
  append?: boolean
): string {
  const firstChar = relative.charAt(0)
  if (firstChar === '/') {
    return relative
  }

  if (firstChar === '?' || firstChar === '#') {
    return base + relative
  }

  const stack = base.split('/')

  // remove trailing segment if:
  // - not appending
  // - appending to trailing slash (last segment is empty)
  if (!append || !stack[stack.length - 1]) {
    stack.pop()
  }

  // resolve relative path
  const segments = relative.replace(/^\//, '').split('/')
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    if (segment === '..') {
      stack.pop()
    } else if (segment !== '.') {
      stack.push(segment)
    }
  }

  // ensure leading slash
  if (stack[0] !== '') {
    stack.unshift('')
  }

  return stack.join('/')
}
```

这个解析的目的是，可能用户手写的路径会有相对路径`../`，也可能是只有参数`?foo=bar`，或者其他情况，这时候需要解析出真正的目标路径。然后又会根据`parsePath.query`和`next.query`执行`resolveQuery`解析出`query`，源码：

```javascript
export function resolveQuery (
  query: ?string,
  extraQuery: Dictionary<string> = {},
  _parseQuery: ?Function
): Dictionary<string> {
  const parse = _parseQuery || parseQuery
  let parsedQuery
  try {
    parsedQuery = parse(query || '')
  } catch (e) {
    process.env.NODE_ENV !== 'production' && warn(false, e.message)
    parsedQuery = {}
  }
  for (const key in extraQuery) {
    parsedQuery[key] = extraQuery[key]
  }
  return parsedQuery
}
```

该函数的主要目的就是整合目标路径上的`query`，目标路径可以是：

1. 字符换`foo/?foo=bar`

2. 对象`{ path: 'foo', query: { foo: 'bar' } }`

但是，最终它们的`query`都会转成`{ foo: 'bar' }`。

+ 没`path`有`params`

```javascript
 // relative params
if (!next.path && next.params && current) {
    next = extend({}, next)
    next._normalized = true
    const params: any = extend(extend({}, current.params), next.params)
    if (current.name) {
      next.name = current.name
      next.params = params
    } else if (current.matched.length) {
      const rawPath = current.matched[current.matched.length - 1].path
      next.path = fillParams(rawPath, params, `path ${current.path}`)
    } else if (process.env.NODE_ENV !== 'production') {
      warn(false, `relative params navigation requires a current route.`)
    }
    return next
}
```

拷贝`next`，拷贝`params`，如果当前路径中有`name`，赋值给`next`同时添加`params`，直接`return`；如果没有`name`，获取当前路径中的`matched`中最顶层的`RouteRecord`的`path`，根据这个`path`和`pramas`通过执行`fillParams`计算出新的`path`，再`return`。

计算出新的`Location`后，会获取它的`name`，如果有，则说明此时的`Location`没有`path`，从`nameMap`中找对到对应的`RouteRecord`，获取它的所有`params`的`key`，遍历`currentRoute`的`params`，将它们的交集的部分，添加到新的`Location`中，通过`record.path`和`location.params`计算出`location.path`，最后通过`_createRoute(record, location, redirectedFrom)`计算出新的`Route`。

如有`path`，会去遍历`pathList`，根据`path`找到对应的`record`，根据`record.regex`和`location.path`匹配，如果匹配成功，就执行`_createRoute(record, location, redirectedFrom)`计算出新的`Route`，否则会执行`_createRoute(null, location)`计算空的`Route`。

`_createRoute`源码：

```javascript
function _createRoute (
    record: ?RouteRecord,
    location: Location,
    redirectedFrom?: Location
  ): Route {
    if (record && record.redirect) {
      return redirect(record, redirectedFrom || location)
    }
    if (record && record.matchAs) {
      return alias(record, location, record.matchAs)
    }
    return createRoute(record, location, redirectedFrom, router)
}
```

不考虑`redirect`和`matchAs`的情况，直接执行`createRoute`，源码：

```javascript
export function createRoute (
  record: ?RouteRecord,
  location: Location,
  redirectedFrom?: ?Location,
  router?: VueRouter
): Route {
  const stringifyQuery = router && router.options.stringifyQuery

  let query: any = location.query || {}
  try {
    query = clone(query)
  } catch (e) {}

  const route: Route = {
    name: location.name || (record && record.name),
    meta: (record && record.meta) || {},
    path: location.path || '/',
    hash: location.hash || '',
    query,
    params: location.params || {},
    fullPath: getFullPath(location, stringifyQuery),
    matched: record ? formatMatch(record) : []
  }
  if (redirectedFrom) {
    route.redirectedFrom = getFullPath(redirectedFrom, stringifyQuery)
  }
  return Object.freeze(route)
}
```

该函数是真正创建`Route`的函数，介绍`Route`的时候说明了`matched`是存储当前`Route`这一条线路上所有的`RouteRecord`，它是通过`formatMatch`计算得出，源码：

```javasc
function formatMatch (record: ?RouteRecord): Array<RouteRecord> {
  const res = []
  while (record) {
    res.unshift(record)
    record = record.parent
  }
  return res
}
```

还是使用之前的那个例子：

```javascript
[
    {
        path: '/foo'
        component: Foo,
        children: [
        	{
        		path: 'bar',
        		component: Bar,
        		children: [
        			{
        				path: 'baz',
        				component: Baz
    				}
        		]
    		}
        ]
    }
]
```

计算`baz`的`Route`的`matched`时，先将他自己的`RouteRecord` `push`到`matched`中，接着向上遍历它的父`RouteRecord`，也就是`bar`的`RouteRecord`，最终遍历到顶层`foo`的`RouteRecord`，所以`matched`最末位永远是每条线路的最外层`RouteRecord`。

### addRoutes

```javascript
function addRoutes (routes) {
  createRouteMap(routes, pathList, pathMap, nameMap)
}
```

这个方法是暴露给用户的接口，动态添加路由的方法，向已经存在的`pathList`和`pathMap`以及`nameMap`中添加新的`path`以及`RouteRecord`。

