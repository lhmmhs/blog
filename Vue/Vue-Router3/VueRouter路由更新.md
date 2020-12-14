Vue-Router版本3.1.6

### 更新url

当用户点击`<router-link>`渲染出的`<a>`标签时，会更新`url`，这是因为`<router-link>`组件默认绑定了`click`事件，而事件函数内部会执行原生`history`的`pushState`或`replaceState`方法。

`<router-link>`组件源码：

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
    const current = this.$route
    const { location, route, href } = router.resolve(
      this.to,
      current,
      this.append
    )

    // ... 

    // 事件函数
    const handler = e => {
      if (guardEvent(e)) {
        if (this.replace) {
          router.replace(location, noop)
        } else {
          router.push(location, noop)
        }
      }
    }
    
    // 默认事件 click
    const on = { click: guardEvent }
    if (Array.isArray(this.event)) {
      this.event.forEach(e => {
        on[e] = handler
      })
    } else {
      on[this.event] = handler
    }

    // ...

    return h(this.tag, data, this.$slots.default)
  }
}
```

可以看出，事件函数内部执行的`router.push`或`router.replace`方法，源码：

```javascript
push (location: RawLocation, onComplete?: Function, onAbort?: Function) {
  // $flow-disable-line
  if (!onComplete && !onAbort && typeof Promise !== 'undefined') {
    return new Promise((resolve, reject) => {
      this.history.push(location, resolve, reject)
    })
  } else {
    this.history.push(location, onComplete, onAbort)
  }
}

replace (location: RawLocation, onComplete?: Function, onAbort?: Function) {
  // $flow-disable-line
  if (!onComplete && !onAbort && typeof Promise !== 'undefined') {
    return new Promise((resolve, reject) => {
      this.history.replace(location, resolve, reject)
    })
  } else {
    this.history.replace(location, onComplete, onAbort)
  }
}
```

`router.push`又会执行`history.push`，`history`的`push`方法不是继承而来，所以不同的`history`实现不同，这里分析`hashHistory`的`push`方法：

```javascript
push (location: RawLocation, onComplete?: Function, onAbort?: Function) {
  const { current: fromRoute } = this
  this.transitionTo(
    location,
    route => {
      pushHash(route.fullPath)
      handleScroll(this.router, route, fromRoute, false)
      onComplete && onComplete(route)
    },
    onAbort
  )
}

replace (location: RawLocation, onComplete?: Function, onAbort?: Function) {
  const { current: fromRoute } = this
  this.transitionTo(
    location,
    route => {
      replaceHash(route.fullPath)
      handleScroll(this.router, route, fromRoute, false)
      onComplete && onComplete(route)
    },
    onAbort
  )
}
```

方法内部执行的`transitionTo`，前面已经分析过`transitionTo`主要是执行导航守卫，当导航守卫全部执行后，就会执行这里传入的回调，回调会执行`pushHash`：

```javascript
function pushHash (path) {
  if (supportsPushState) {
    pushState(getUrl(path))
  } else {
    window.location.hash = path
  }
}
```

支持`window.history.pushState` 的情况下，去执行`pushState`：

```javascript
export function pushState (url?: string, replace?: boolean) {
  saveScrollPosition()
  // try...catch the pushState call to get around Safari
  // DOM Exception 18 where it limits to 100 pushState calls
  const history = window.history
  try {
    if (replace) {
      // preserve existing history state as it could be overriden by the user
      const stateCopy = extend({}, history.state)
      stateCopy.key = getStateKey()
      history.replaceState(stateCopy, '', url)
    } else {
      history.pushState({ key: setStateKey(genStateKey()) }, '', url)
    }
  } catch (e) {
    window.location[replace ? 'replace' : 'assign'](url)
  }
}
```

该函数获取原生`window.history`，然后调用它的方法`pushState`或`replaceState`更新`url`。