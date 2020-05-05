Vue-router版本3.1.6

### `<router-view>`

```javascript
export default {
  name: 'RouterView',
  functional: true,
  props: {
    name: {
      type: String,
      default: 'default'
    }
  },
  render(_, { props, children, parent, data }) {
    // used by devtools to display a router-view badge
    data.routerView = true

    // directly use parent context's createElement() function
    // so that components rendered by router-view can resolve named slots
    const h = parent.$createElement
    const name = props.name
    
    // this._routerRoot._route
    const route = parent.$route
    const cache = parent._routerViewCache || (parent._routerViewCache = {})

    // determine current view depth, also check to see if the tree
    // has been toggled inactive but kept-alive.
    let depth = 0
    let inactive = false
    while (parent && parent._routerRoot !== parent) {
      const vnodeData = parent.$vnode ? parent.$vnode.data : {}
      if (vnodeData.routerView) {
        depth++
      }
      if (vnodeData.keepAlive && parent._directInactive && parent._inactive) {
        inactive = true
      }
      parent = parent.$parent
    }
    data.routerViewDepth = depth

    //...

    const matched = route.matched[depth]
    const component = matched && matched.components[name]
    
    
    // render empty node if no matched route or no config component
    if (!matched || !component) {
      cache[name] = null
      return h()
    }

    // cache component
    cache[name] = { component }

    // attach instance registration hook
    // this will be called in the instance's injected lifecycle hooks
    data.registerRouteInstance = (vm, val) => {
      // val could be undefined for unregistration
      const current = matched.instances[name]
      if (
        (val && current !== vm) ||
        (!val && current === vm)
      ) {
        matched.instances[name] = val
      }
    }
	
    //...

    return h(component, data, children)
  }
}
```

`data.routerView`是一个标识，表示组件是在`<router-view>`下渲染出来的，举个例子：

```html
// App.vue
<template>
  <div>
    <router-link to="/foo">foo</router-link>
    <router-link to="/bar">bar</router-link>
    <router-view></router-view>
  </div>
</template>

// Foo.vue
<template>
  <div>Foo</div>
</template>

// Bar.vue
<template>
  <div>Bar</div>
</template>
```

`Foo`和`Bar`组件是在`<router-view>`下被渲染出来的，那么`Foo`和`Bar`组件所对应的`vnode`的`data`属性就包含`routerView`属性，且值为`true`。设置这个属性的目的是因为`<router-view>`存在嵌套，如果存在嵌套情况，需要此属性判断。

访问`parent.$route`，会访问`this._routerRoot._route`，原因是在路由安装的过程中，会执行下面的代码：

```javascript
Object.defineProperty(Vue.prototype, '$route', {
  get () { return this._routerRoot._route }
})
```

访问`this._routerRoot._route`就是访问根`Vue`实例上的`_route`，这是因为在安装路由的过程中，全局混入的`beforeCreate`钩子，实例化根`Vue`过程会将`this._routerRoot = this`，而实例化子组件过程会将`this._routerRoot = (this.$parent && this.$parent._routerRoot) || this`，那么`this._routerRoot`一直都是根`Vue`实例。

举个例子：

```html
// App.vue
<template>
  <div>
    <router-link to="/foo">foo</router-link>
    <router-link to="/bar">bar</router-link>
    <router-view></router-view>
  </div>
</template>
```

```javascript
// main.js
new Vue({
  router,
  render: h => h(App)
}).$mount('#app')
```

```javascript
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
}
```

实例化`Vue`的过程会执行`beforeCreate`，进而执行：

```javascript
this._routerRoot = this;
```

实例化`App`组件的过程，会执行`beforeCreate`，进而执行：

```javascript
this._routerRoot = (this.$parent && this.$parent._routerRoot) || this;
```

此时的`this.$parent`是根`Vue`实例，`this.$parent._routerRoot`也是根`Vue`，那么`this._routerRoot`就是根`Vue`实例。

实例化`<router-link>`的过程，也会执行`beforeCreate`，进而执行：

```javascript
this._routerRoot = (this.$parent && this.$parent._routerRoot) || this;
```

而此时的`this.$parent`是`App`实例，`this.$parent._routerRoot`是根`Vue`实例，所以`this._routerRoot`还是根`Vue`实例，如果还有子组件，还会执行相同逻辑，最终`this._routerRoot`都会被赋值为根`Vue`实例。

```javascript
let depth = 0
let inactive = false
while (parent && parent._routerRoot !== parent) {
  const vnodeData = parent.$vnode ? parent.$vnode.data : {}
  if (vnodeData.routerView) {
    depth++
  }
  // keep-alive 相关
  if (vnodeData.keepAlive && parent._directInactive && parent._inactive) {
    inactive = true
  }
  parent = parent.$parent
}
data.routerViewDepth = depth
```

`depth`是`<router-view>`渲染组件所对应的深度，`while`是不断向上遍历的过程，`parent`存在，且不能是根`Vue`，如果`parent.$vnode.data.routerView`为`true`，说明当前组件的父组件是被`router-view`所渲染出来的，那么当前组件就是被嵌套的`<router-view>`渲染出来的。

举个例子：

```html
// App.vue
<template>
  <div>
    <router-link to="/foo">foo</router-link>
    <router-link to="/foo/bar">bar</router-link>
    <!-- 这里渲染的是Foo -->
    <router-view></router-view>
  </div>
</template>

// Foo.vue
<template>
  <div>
  	<h1>Foo</h1>
  	<!-- 这里渲染的是Bar -->
    <router-view></router-view>
  </div>
</template>

// Bar.vue
<template>
  <div>Bar</div>
</template>
```

`App`组件中的`<router-view>`渲染的是`Foo`，那么`Foo`的`depth`是`0`，`Foo`组件中的`<router-view>`渲染的是`Bar`，它对应的`depth`是`1`，`data.routerViewDepth`缓存`depth`。

然后我们根据`depth`从当前`route.matched`的拿到对应的`record`，在从`record.compoents`根据对应的`name`拿到对应的组件，此时，`<router-view>`就找到了应该渲染的组件。

找到对应的渲染组件后，会设置一个注册组件实例的方法：

```javascript
data.registerRouteInstance = (vm, val) => {
  // val could be undefined for unregistration
  const current = matched.instances[name]
  if (
    (val && current !== vm) ||
    (!val && current === vm)
  ) {
    matched.instances[name] = val
  }
}
```

在`data`上添加了`registerRouteInstance`方法。组件实例化的过程会执行`beforeCreate`钩子，从而执行该函数，将组件实例赋值给`matched.instances[name]`。

最后根据`component`创建出对应的`vnode`。

`url`更新后，对应组件会被渲染，原因是，实例化根`Vue`过程会执行`beforeCreate`钩子，进而执行下面的逻辑：

```javascript
Vue.util.defineReactive(this, '_route', this._router.history.current);
```

将`_route`属性转化响应数据，所以当访问`parent.$route`时会触发`_route`的`getter`进行依赖收集。

`VueRouter` 实例执行 `router.init` 方法的时候：

```javascript
history.listen(route => {
  this.apps.forEach((app) => {
    app._route = route
  })
})

listen (cb: Function) {
  this.cb = cb
}
```

`history.listen`就是初始化`history.cb`，`this.apps`内部保存的是只有在组件配置中传入`router`的组件实例，通常情况下只有根`Vue`配置中会传入`router`，所以`app`就是组件根`Vue`实例。`cb`内部会对`app._route`进行赋值，从而触发`_route`的`setter`，进而触发组件的重新渲染，而`history.cb`执行的时机恰好是在`transitionTo`最后执行 `updateRoute` 时候执行：

```javascript
updateRoute(route: Route) {
  const prev = this.current
  this.current = route
  this.cb && this.cb(route)
  this.router.afterHooks.forEach(hook => {
    hook && hook(route, prev)
  })
}
```

### `<router-link>`

```javascript
export default {
  name: 'RouterLink',
  props: {
    to: {
      type: toTypes,
      required: true
    },
    tag: {
      type: String,
      default: 'a'
    },
    exact: Boolean,
    append: Boolean,
    replace: Boolean,
    activeClass: String,
    exactActiveClass: String,
    ariaCurrentValue: {
      type: String,
      default: 'page'
    },
    event: {
      type: eventTypes,
      default: 'click'
    }
  },
  render (h: Function) {
    const router = this.$router
    // 当前路径对应的route
    const current = this.$route
    const { location, route, href } = router.resolve(
      this.to,
      current,
      this.append
    )

    // ... 处理class

    const ariaCurrentValue = classes[exactActiveClass] ? this.ariaCurrentValue : null

    // ... 处理事件

    const data: any = { class: classes }
      
    const scopedSlot =
      !this.$scopedSlots.$hasNormal &&
      this.$scopedSlots.default &&
      this.$scopedSlots.default({
        href,
        route,
        navigate: handler,
        isActive: classes[activeClass],
        isExactActive: classes[exactActiveClass]
      })

    if (scopedSlot) {...}

    // ... 处理tag

    return h(this.tag, data, this.$slots.default)
  }
}
```

`<router-link>`的是基于`render`函数的，首先进行的路由解析`router.reslove`：

```javascript
resolve (
  to: RawLocation,
  current?: Route,
  append?: boolean
): {
  location: Location,
  route: Route,
  href: string,
  // for backwards compat
  normalizedTo: Location,
  resolved: Route
} {
  current = current || this.history.current
  const location = normalizeLocation(
    to,
    current,
    append,
    this
  )
  const route = this.match(location, current)
  const fullPath = route.redirectedFrom || route.fullPath
  const base = this.history.base
  const href = createHref(base, fullPath, this.mode)
  return {
    location,
    route,
    href,
    // for backwards compat
    normalizedTo: location,
    resolved: route
  }
}
```

解析的第一步是规范化`location`，第二步是通过`match`匹配`route`，第三步就是执行`createHref`计算`href`属性：

```javascript
function createHref (base: string, fullPath: string, mode) {
  var path = mode === 'hash' ? '#' + fullPath : fullPath
  return base ? cleanPath(base + '/' + path) : path
}
```



```javascript
const classes = {}
const globalActiveClass = router.options.linkActiveClass
const globalExactActiveClass = router.options.linkExactActiveClass
// Support global empty active class
const activeClassFallback =
  globalActiveClass == null ? 'router-link-active' : globalActiveClass
const exactActiveClassFallback =
  globalExactActiveClass == null
    ? 'router-link-exact-active'
    : globalExactActiveClass
const activeClass =
  this.activeClass == null ? activeClassFallback : this.activeClass
const exactActiveClass =
  this.exactActiveClass == null
    ? exactActiveClassFallback
    : this.exactActiveClass

const compareTarget = route.redirectedFrom
  ? createRoute(null, normalizeLocation(route.redirectedFrom), null, router)
  : route

classes[exactActiveClass] = isSameRoute(current, compareTarget)
classes[activeClass] = this.exact
  ? classes[exactActiveClass]
  : isIncludedRoute(current, compareTarget)
```

回到`<router-link>`的`render`方法，处理`activeClass`和`exactActiveClass`，先获取全局`router.options.linkActiveClass`，如果没配置默认是`router-link-active`，在判断`<router-link>`的`activeClass`，如果没配置就是全局配置的`linkActiveClass`，都没配置就是`router-link-active`，`exactActiveClass`同理。

然后我们获取`this.to`对应`route`，它和当前的`route`对比，相同的情况，说明完全匹配，那么`classes[exactActiveClass]`值就是`true`，反之为`false`，`classes[activeClass]`是根据`exact`计算的，配置了，和`classes[exactActiveClass]`相同，否则会通过`isIncludedRoute(current, compareTarget)`判断`this.to`对应的`route`是否包含在`current`中，包含`classes[activeClass]`就为`true`不包含就为`false`。

举个例子，当前路径是`localhost/#/foo/children`时：

```html
<router-link to="/" class="link"></router-link>
<router-link to="/" class="link" exact></router-link>

<router-link to="/foo" class="link"></router-link>
<router-link to="/foo" class="link" exact></router-link>

<router-link to="/bar" class="link"></router-link>
<router-link to="/foo/chidlren" class="link"></router-link>

<!-- 非精确匹配 -->
<a href="#/" class="link router-link-active"></a>
<!-- 精确匹配 -->
<a href="#/" class="link"></a>

<!-- 非精确匹配 -->
<a href="#/foo" class="link router-link-active"></a>
<!-- 精确匹配 -->
<a href="#/foo" class="link"></a>

<a href="#/bar" class="link"></a>
<a href="#/foo/chidlren" class="link router-link-active router-link-exact-active"></a>
```

`/foo/children`包含`/foo`和`/`，精确匹配的情况下，被包含的路由不会激活，非精确匹配则会激活。

```javascript
const handler = e => {
  if (guardEvent(e)) {
    if (this.replace) {
      router.replace(location, noop)
    } else {
      router.push(location, noop)
    }
  }
}

const on = { click: guardEvent }
if (Array.isArray(this.event)) {
  this.event.forEach(e => {
    on[e] = handler
  })
} else {
  on[this.event] = handler
}
```

接着是事件的处理，定义了`handler`，这是当用户点击`a`标签时，会触发的事件函数，内部会先执行`guardEvent`判断：

```javascript
function guardEvent (e) {
  // don't redirect with control keys
  if (e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) return
  // don't redirect when preventDefault called
  if (e.defaultPrevented) return
  // don't redirect on right click
  if (e.button !== undefined && e.button !== 0) return
  // don't redirect if `target="_blank"`
  if (e.currentTarget && e.currentTarget.getAttribute) {
    const target = e.currentTarget.getAttribute('target')
    if (/\b_blank\b/i.test(target)) return
  }
  // this may be a Weex event which doesn't have this method
  if (e.preventDefault) {
    // history模式 阻止页面刷新
    e.preventDefault()
  }
  return true
}
```

主要目的是在`history`模式下阻止页面刷新，在调用`router.push`或`router.replace`，去更新路径，默认的事件类型是`click`，可以通过`event`属性来修改事件的类型，`event`可以是数组，给多种事件类型绑定事件函数。

```javascript
const data: any = { class: classes }

// ...

if (this.tag === 'a') {
  data.on = on
  data.attrs = { href, 'aria-current': ariaCurrentValue }
} else {
  // find the first <a> child and apply listener and href
  const a = findAnchor(this.$slots.default)
  if (a) {
    // in case the <a> is a static node
    a.isStatic = false
    const aData = (a.data = extend({}, a.data))
    aData.on = aData.on || {}
    // transform existing events in both objects into arrays so we can push later
    for (const event in aData.on) {
      const handler = aData.on[event]
      if (event in on) {
        aData.on[event] = Array.isArray(handler) ? handler : [handler]
      }
    }
    // append new listeners for router-link
    for (const event in on) {
      if (event in aData.on) {
        // on[event] is always a function
        aData.on[event].push(on[event])
      } else {
        aData.on[event] = handler
      }
    }

    const aAttrs = (a.data.attrs = extend({}, a.data.attrs))
    aAttrs.href = href
    aAttrs['aria-current'] = ariaCurrentValue
  } else {
    // doesn't have <a> child, apply listener to self
    data.on = on
  }
}
```

定义`data`，将处理好的`classes`添加上，`data`是组件`vnode`对应的`vnodeDta`。

最后会判断`tag`，如果是`a`标签就直接给`data`添加`on`和`href`属性，不是`a`标签的情况，会先执行`findAnchor`寻找子节点：

```javascript
function findAnchor (children) {
  if (children) {
    let child
    for (let i = 0; i < children.length; i++) {
      child = children[i]
      if (child.tag === 'a') {
        return child
      }
      if (child.children && (child = findAnchor(child.children))) {
        return child
      }
    }
  }
}
```

如果找到子节点是`a`标签，为这个标签添加`on`和`href`，没找到直接添加到`data`上。

