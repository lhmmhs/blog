Vue-router版本3.1.6

路由导航的执行时机时在执行`transitionTo`的时候，源码：

```javascript
transitionTo (
    location: RawLocation,
    onComplete?: Function,
    onAbort?: Function
  ) {
    const route = this.router.match(location, this.current)
    this.confirmTransition(
      route,
      () => {...},
      err => {...}
    )
}
```

执行`this.confirmTransition`是真正执行导航守卫的时机，`confirmTransition`源码：

```javascript
confirmTransition (route: Route, onComplete: Function, onAbort?: Function) {
    const current = this.current
    const abort = err => {...}
    // ...

    const { updated, deactivated, activated } = resolveQueue(
      this.current.matched,
      route.matched
    )
    
    // 导航守卫队列
    const queue: Array<?NavigationGuard> = [].concat(...)

    this.pending = route
    const iterator = (hook: NavigationGuard, next) => {...}
	
    // 执行导航守卫
    runQueue(queue, iterator, () => {...})
}
```

在执行导航守卫之前，需要根据`this.current.matched`和`route.matched`通过执行`resloveQueue`计算出复用，待激活，待失活的`record`，`resloveQueue`源码：

```javascript
function resolveQueue (
  current: Array<RouteRecord>,
  next: Array<RouteRecord>
): {
  updated: Array<RouteRecord>,
  activated: Array<RouteRecord>,
  deactivated: Array<RouteRecord>
} {
  let i
  const max = Math.max(current.length, next.length)
  for (i = 0; i < max; i++) {
    if (current[i] !== next[i]) {
      break
    }
  }
  return {
    // 复用
    updated: next.slice(0, i),
    // 待激活
    activated: next.slice(i),
    // 待失活
    deactivated: current.slice(i)
  }
}
```

目的是为了之后调用不同组件的导航守卫做准备。

### 导航守卫队列

```javascript
const queue: Array<?NavigationGuard> = [].concat(
      // in-component leave guards
      extractLeaveGuards(deactivated),
      // global before hooks
      this.router.beforeHooks,
      // in-component update hooks
      extractUpdateHooks(updated),
      // in-config enter guards
      activated.map(m => m.beforeEnter),
      // async components
      resolveAsyncComponents(activated)
)
```

1. 失活组件的导航守卫`extractLeaveGuards(deactivated)`

```javascript
function extractLeaveGuards (deactivated: Array<RouteRecord>): Array<?Function> {
  return extractGuards(deactivated, 'beforeRouteLeave', bindGuard, true)
}

function extractGuards (
  records: Array<RouteRecord>,
  name: string,
  bind: Function,
  reverse?: boolean
): Array<?Function> {
  const guards = flatMapComponents(records, (def, instance, match, key) => {
    const guard = extractGuard(def, name)
    if (guard) {
      return Array.isArray(guard)
        ? guard.map(guard => bind(guard, instance, match, key))
        : bind(guard, instance, match, key)
    }
  })
  return flatten(reverse ? guards.reverse() : guards)
}
```

`extractLeaveGuards`内部执行`extractGuards`，而`extractGuards`通过执行`flatMapComponents`返回所有失活组件的导航守卫，源码：

```javascript
export function flatMapComponents (
  matched: Array<RouteRecord>,
  fn: Function
): Array<?Function> {
  // m -> record
  return flatten(matched.map(m => {
    return Object.keys(m.components).map(key => fn(
      m.components[key],
      m.instances[key],
      m, key
    ))
  }))
}

export function flatten (arr: Array<any>): Array<any> {
  return Array.prototype.concat.apply([], arr)
}
```

`flatMapComponents`遍历`matched`，通过`record`找到对应的失活组件以及失活组件的实例，并传入到执行`flatMapComponents`传入的回调：

```javascript
(def, instance, match, key) => {
    const guard = extractGuard(def, name)
    if (guard) {
      return Array.isArray(guard)
        ? guard.map(guard => bind(guard, instance, match, key))
        : bind(guard, instance, match, key)
    }
}

function extractGuard (
  def: Object | Function,
  key: string
): NavigationGuard | Array<NavigationGuard> {
  if (typeof def !== 'function') {
    // extend now so that global mixins are applied.
    def = _Vue.extend(def)
  }
  return def.options[key]
}
```

回调中，先执行`extractGuard`去抽取组件内的导航守卫，然后对这个导航守卫通过执行`bind`进行包装，`bind`函数就是执行`extractGuards(deactivated, 'beforeRouteLeave', bindGuard, true)`传入的`bindGuard`，源码：

```javascript
function bindGuard (guard: NavigationGuard, instance: ?_Vue): ?NavigationGuard {
  if (instance) {
    return function boundRouteGuard () {
      return guard.apply(instance, arguments)
    }
  }
}
```

包装的目的主要是为了可以拿到组件的实例，返回失活组件的导航守卫就是这个`boundRouteGuard`函数，而用户配置的`beforeRouteLeave `就是`guard`。

2. 全局前置导航守卫`this.router.beforeHooks`

```javascript
router.beforeEach((to, from, next) => {
  // ...
})
```

用户配置的全局前置导航守卫，是通过`VueRouter`的`beforeEach`方法注入的，源码：

```javascript
beforeEach (fn: Function): Function {
  return registerHook(this.beforeHooks, fn)
}

function registerHook (list: Array<any>, fn: Function): Function {
  list.push(fn)
  return () => {
    const i = list.indexOf(fn)
    if (i > -1) list.splice(i, 1)
  }
}
```

`beforeEach`内部执行`registerHook`，将用户配置的导航守卫`push`进`VueRouter`的`beforeHooks`属性中，这样`this.router.beforeHooks`就可以拿到全局前置导航守卫了。

3. 重用组件的导航守卫`extractUpdateHooks(updated)`

```javascript
function extractUpdateHooks (updated: Array<RouteRecord>): Array<?Function> {
  return extractGuards(updated, 'beforeRouteUpdate', bindGuard)
}
```

`extractUpdateHooks`内部也是执行`extractGuards`函数，和上面类似，跳过。

4. 路由导航守卫`activated.map(m => m.beforeEnter)`

路由导航守卫，是直接遍历所有激活`record`从它里面直接获取`beforeEnter`。

5. 解析异步路由组件`resolveAsyncComponents(activated)`

```javascript
export function resolveAsyncComponents (matched: Array<RouteRecord>): Function {
  return (to, from, next) => {
    let hasAsync = false
    let pending = 0
    let error = null

    flatMapComponents(matched, (def, _, match, key) => {
      // if it's a function and doesn't have cid attached,
      // assume it's an async component resolve function.
      // we are not using Vue's default async resolving mechanism because
      // we want to halt the navigation until the incoming component has been
      // resolved.
      if (typeof def === 'function' && def.cid === undefined) {
        hasAsync = true
        pending++

        const resolve = once(resolvedDef => {...})

        const reject = once(reason => {...})

        let res
        try {
          // def -> () => import()
          res = def(resolve, reject)
        } catch (e) {
          reject(e)
        }
        if (res) {
          if (typeof res.then === 'function') {
            res.then(resolve, reject)
          } else {
            // new syntax in Vue 2.3
            const comp = res.component
            if (comp && typeof comp.then === 'function') {
              comp.then(resolve, reject)
            }
          }
        }
      }
    })

    if (!hasAsync) next()
  }
}
```

根据`hasAsync`这个变量，来判断是否含有异步组件，如果没有就直接执行`next`；如果有就会将`hasAsync` 修改为`true`，通常情况下，异步组件都是一个函数，并且函数会返回`Promise`：

```javascript
{
  path: '/foo',
  component: () => import('../Foo.vue')
}
```

通过`res = def(resolve, reject)`执行用户配置的异步组件函数，`import`可以理解为去服务器请求对应的`js`文件，请求成功后会执行`resolve`，`resolve`被`once`包装了一层，目的是`resolve`只被执行一次。

```javascript
const resolve = once(resolvedDef => {
  if (isESModule(resolvedDef)) {
    resolvedDef = resolvedDef.default
  }
  // save resolved on async factory in case it's used elsewhere
  def.resolved = typeof resolvedDef === 'function'
    ? resolvedDef
    : _Vue.extend(resolvedDef)
  match.components[key] = resolvedDef
  pending--
  if (pending <= 0) {
    next()
  }
})

function once (fn) {
  let called = false
  return function (...args) {
    if (called) return
    called = true
    return fn.apply(this, args)
  }
}
```

解析成功的异步组件，被`def.resolved`缓存，同时被放在对应的`record` 的`components[key]`中，然后执行`next`。

如果请求失败，那么会执行`reject`，同样`rejcet`被包装一层，确保只执行一次。

```javascript
var reject = once(function (reason) {
  var msg = "Failed to resolve async component " + key + ": " + reason;
  process.env.NODE_ENV !== 'production' && warn(false, msg);
  if (!error) {
    error = isError(reason)
      ? reason
      : new Error(msg);
    next(error);
  }
});
```

失败的情况，同样会执行`next`，并将失败的原因传入。

导航守卫的队列构造完毕后，会定义`iterator`函数，它是用来执行导航守卫用的，源码：

```javascript
const iterator = (hook: NavigationGuard, next) => {
  if (this.pending !== route) {
    return abort()
  }
  try {
    hook(route, current, (to: any) => {
      if (to === false || isError(to)) {
        // next(false) -> abort navigation, ensure current URL
        this.ensureURL(true)
        abort(to)
      } else if (
        typeof to === 'string' ||
        (typeof to === 'object' &&
          (typeof to.path === 'string' || typeof to.name === 'string'))
      ) {
        // next('/') or next({ path: '/' }) -> redirect
        abort()
        if (typeof to === 'object' && to.replace) {
          this.replace(to)
        } else {
          this.push(to)
        }
      } else {
        // confirm transition and pass on the value
        // 此next不是用户配置的导航守卫中的next
        next(to)
      }
    })
  } catch (e) {
    abort(e)
  }
}
```

执行`hook`，该函数就是导航守卫，`hook`的第三个参数就是用户配置导航守卫的第三个参数`next`，内部分为3中情况，传入`next`的参数是`false`，就会停止执行之后的导航守卫；传入参数是字符串或者是对象，那么就会执行`this.replace`或`this.push`，这2个方法会再次执行`transitionTo`；如果没传参数，就会直接执行`next`，进而执行后续的导航守卫。

接下来是执行`runQueue`，源码：

```javascript
export function runQueue (queue: Array<?NavigationGuard>, fn: Function, cb: Function) {
  const step = index => {
    if (index >= queue.length) {
      cb()
    } else {
      if (queue[index]) {
        fn(queue[index], () => {
          step(index + 1)
        })
      } else {
        step(index + 1)
      }
    }
  }
  step(0)
}
```

函数内部定义了`step`函数，根据`index`获取`queue`中的导航守卫，然后执行`fn`，导航守卫作为`fn`的第一个参数，第二个参数是一个函数，函数内部递归的执行了`setp`，说明是继续执行后面的导航守卫，`fn`是上面分析的`iterator`函数；当命中`if(index >= queue.length)`这个逻辑的时候，说明`queue`中的导航守卫已经全部执行完，进而执行`cb`：

```javascript
() => {
    const postEnterCbs = []
    const isValid = () => this.current === route
    // wait until async components are resolved before
    // extracting in-component enter guards
    const enterGuards = extractEnterGuards(activated, postEnterCbs, isValid)
    const queue = enterGuards.concat(this.router.resolveHooks)
    runQueue(queue, iterator, () => {...})
}
```

该函数会再一次定义一个导航守卫的队列`queue`：

6. 组件内导航守卫`extractEnterGuards(activated, postEnterCbs, isValid)`

```javascript
function extractEnterGuards (
  activated: Array<RouteRecord>,
  cbs: Array<Function>,
  isValid: () => boolean
): Array<?Function> {
  return extractGuards(
    activated,
    'beforeRouteEnter',
    (guard, _, match, key) => {
      return bindEnterGuard(guard, match, key, cbs, isValid)
    }
  )
}
```

`extractEnterGuards`内部执行依然是`extractGuards`，第三个参数是绑定函数，主要作用就是让组件内的导航守卫可以访问到组件实例，但是执行`beforeRouteEnter`时组件还没有实例化，所以在该导航守卫内不能获取到组件的实例。

官方直接给出了解决方案：

```javascript
beforeRouteEnter (to, from, next) {
  next(vm => {
    // 通过 `vm` 访问组件实例
  })
}
```

`bindEnterGuard`源码：

```javascript
function bindEnterGuard (
  guard: NavigationGuard,
  match: RouteRecord,
  key: string,
  cbs: Array<Function>,
  isValid: () => boolean
): NavigationGuard {
  return function routeEnterGuard (to, from, next) {
    return guard(to, from, cb => {
      if (typeof cb === 'function') {
        cbs.push(() => {
          // #750
          // if a router-view is wrapped with an out-in transition,
          // the instance may not have been registered at this time.
          // we will need to poll for registration until current route
          // is no longer valid.
          poll(cb, match.instances, key, isValid)
        })
      }
      next(cb)
    })
  }
}
```

`guard`就是上面案例中的`beforeRouteEnter`，当向`next`传入回调的时候，就命中了`if (typeof cb === 'function')`这个逻辑，此时会将`cbs`也就是外面定义的`postEnterCbs`，`push`进一个回调，这个回调内部会执行`poll`，并且将传入`next`的回调传入其中，同时还传入`match.instances`。`poll`源码：

```javascript
function poll (
  cb: any, // somehow flow cannot infer this is a function
  instances: Object,
  key: string,
  isValid: () => boolean
) {
  if (
    instances[key] &&
    !instances[key]._isBeingDestroyed // do not reuse being destroyed instance
  ) {
    cb(instances[key])
  } else if (isValid()) {
    setTimeout(() => {
      poll(cb, instances, key, isValid)
    }, 16)
  }
}
```

`poll`就是异步的递归调用自己，直到组件被实例化后，`instances[key]`就会有值，就会调用`next`传入的回调将该实例传入。

7. 全局解析导航守卫`this.router.resolveHooks`

```javascript
router.beforeResolve((to, from, next) => {
  //...
})

beforeResolve (fn: Function): Function {
  return registerHook(this.resolveHooks, fn)
}
```

和`beforeEach`类似。

8. 全局后置导航守卫`this.router.afterHooks`

收集完这2类导航守卫后，会再次执行`runQueue`，当执行所有的导航守卫后，执行下面的回调：

```javascript
() => {
  if (this.pending !== route) {
    return abort()
  }
  this.pending = null
  onComplete(route)
  if (this.router.app) {
    this.router.app.$nextTick(() => {
      postEnterCbs.forEach(cb => {
        cb()
      })
    })
  }
})

// 执行confirmTransition时传入的onComplete回调
() => {
  this.updateRoute(route)
  onComplete && onComplete(route)
  this.ensureURL()

  // fire ready cbs once
  if (!this.ready) {
    this.ready = true
    this.readyCbs.forEach(cb => {
      cb(route)
    })
  }
}

updateRoute(route: Route) {
  const prev = this.current
  this.current = route
  this.cb && this.cb(route)
  this.router.afterHooks.forEach(hook => {
    hook && hook(route, prev)
  })
}
```

执行`confirmTransition`传入的`onComplete`，会执行`this.updateRoute`，进而执行最后的全局后置导航守卫`afterHooks`，然后会执行`postEnterCbs`中的回调，进而执行`poll`，就可以在组件导航守卫`beforeRouteEnter`的`next`回调中拿到组件实例。

