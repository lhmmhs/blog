最近[element-plus](https://github.com/element-plus/element-plus)官方更新了分页组件，我特地查看了一下它的源码，省略号的显示是通过`watchEffect`来解决的，源码：

```javascript
<script lang="ts">
    
// ...

export default defineComponent({
  name: 'ElPager',
  props: {
    currentPage: {
      type: Number,
      default: 1,
    },
    pageCount: {
      type: Number,
      default: 50,
    },
    pagerCount: {
      type: Number,
      default: 7,
    },
    disabled: Boolean,
  },
  emits: ['change'],
  setup(props, { emit }) {
    const showPrevMore = ref(false)
    const showNextMore = ref(false)
    
    // ...
    
    const pagers = computed(() => {
      const pagerCount = props.pagerCount
      const halfPagerCount = (pagerCount - 1) / 2
      const currentPage = Number(props.currentPage)
      const pageCount = Number(props.pageCount)
      let showPrevMore = false
      let showNextMore = false
      if (pageCount > pagerCount) {
        if (currentPage > pagerCount - halfPagerCount) {
          showPrevMore = true
        }
        if (currentPage < pageCount - halfPagerCount) {
          showNextMore = true
        }
      }
      const array = []
      if (showPrevMore && !showNextMore) {
        const startPage = pageCount - (pagerCount - 2)
        for (let i = startPage; i < pageCount; i++) {
          array.push(i)
        }
      } else if (!showPrevMore && showNextMore) {
        for (let i = 2; i < pagerCount; i++) {
          array.push(i)
        }
      } else if (showPrevMore && showNextMore) {
        const offset = Math.floor(pagerCount / 2) - 1
        for (let i = currentPage - offset; i <= currentPage + offset; i++) {
          array.push(i)
        }
      } else {
        for (let i = 2; i < pageCount; i++) {
          array.push(i)
        }
      }
      return array
    })
    
    // 问题解决方案
    watchEffect(() => {	
      const halfPagerCount = (props.pagerCount - 1) / 2
      showPrevMore.value = false
      showNextMore.value = false
      if (props.pageCount > props.pagerCount) {
        if (props.currentPage > props.pagerCount - halfPagerCount) {
          showPrevMore.value = true
        }
        if (props.currentPage < props.pageCount - halfPagerCount) {
          showNextMore.value = true
        }
      }
    })
      
    // ...
    
    return {
      showPrevMore,
      showNextMore,
      quicknextIconClass,
      quickprevIconClass,
      pagers,
      onMouseenter,
      onPagerClick,
    }
  },
})
</script>
```

下面这段代码是模拟上面代码的简单的例子：

```javascript
Vue.createApp({
  template: `
	<div>{{data.flag}}</div>
	<div @click="onClick">{{updateMsg}}</div>
  `,
  setup(props) {
    const data = Vue.reactive({
      msg: 'vue',
      flag: false
    });

    const updateMsg = Vue.computed(() =>  'hello ' + data.msg)
    
    Vue.watchEffect(() => {
        if(data.msg === "css") {
			data.flag = true
        }
    })

    function onClick() {
      data.msg = "css"
    }

    return {
      data,
      updateMsg,
      onClick
    };
  },
}).mount("#app")
```

简单的描述一下响应式部分的运行过程：

1. 执行`setup`
   * 初始化`data`，使用`proxy`做代理，使之转化为响应式的
   * 初始化计算属性`updateMsg`，使之转化为响应式的
   * 执行`watchEffect`，它会立即执行传入的副作用函数，进而访问`data.msg`，触发它的`getter`，收集当前激活的副作用函数，传入的副作用函数`watch effect`

2. 执行`render`
   * 访问`data.flag`，触发它的`getter`，收集当前激活的副作用函数，渲染组件`effect`
   * 访问计算属性`updateMsg`，触发它的`getter`，收集当前激活的副作用函数，渲染组件`effect`
   * 执行计算属性`updateMsg`的`getter`，访问`data.msg`，触发它的`getter`，收集当前激活的副作用函数，计算属性`effect`

上述过程结束后，`data.msg`收集了2个副作用函数，分别是`watch effect`和计算属性` effect`。

当改变`data.msg`的时候，触发它的`setter`，去通知`watch effect`和计算属性` effect`执行，先执行`watch effect`，**它的`scheduler`会将自身压入到`pendingPostFlushCbs`中**，然后执计算属性`effect`，它的`scheduler`会触发自身的`setter`，去通知它收集的渲染组件`effect`执行，它的`scheduler`就会将它自身压入到待更新的异步队列`queue`中，此时，异步队列中的`effect`，就只有渲染组件`effect`1 个。

执行异步队列中的这个渲染组件`effect`，执行`render`，执行`patch`，此时组件更新后的样子：

```html
false
hello css
```

`queue`内所有`effect`执行完毕后，会去检查`pendingPostFlushCbs`队列中是否有任务需要执行，最早被压入其中的`watch effect`现在可以执行了，现在的`data.msg`值已经修改为`css`，所以会执行`data.flag=true`这行代码，那么就会出触发`data.flag`的`setter`去通知它的渲染组件`effect`执行，渲染组件`effect`会在一次通过自身的`scheduler`将自身先压入到异步队列`queue`中，等待执行，此时，`data.flag`的值已经修改为`true`，所以，现在执行队列中的渲染组件`effect`，就会渲染为最终的结果。

执行异步队列的函数源码：

```javascript
function flushJobs(seen) {
  isFlushPending = false
  isFlushing = true
  {
    seen = seen || new Map()
  }
  // 组件更新前，检查pendingPreFlushCbs中是否有任务待执行
  flushPreFlushCbs(seen)
  // Sort queue before flush.
  // This ensures that:
  // 1. Components are updated from parent to child. (because parent is always
  //    created before the child so its render effect will have smaller
  //    priority number)
  // 2. If a component is unmounted during a parent component's update,
  //    its update can be skipped.
  // Jobs can never be null before flush starts, since they are only invalidated
  // during execution of another flushed job.
  queue.sort((a, b) => getId(a) - getId(b))
  try {
    for (flushIndex = 0; flushIndex < queue.length; flushIndex++) {
      const job = queue[flushIndex]
      if (job) {
        if (true) {
          checkRecursiveUpdates(seen, job)
        }
        // 执行异步队列中任务
        callWithErrorHandling(job, null, 14 /* SCHEDULER */)
      }
    }
  } finally {
    flushIndex = 0
    queue.length = 0
    // 组件更新后，检查pendingPostFlushCbs中是否有任务待执行
    flushPostFlushCbs(seen)
    isFlushing = false
    currentFlushPromise = null
    // some postFlushCb queued jobs!
    // keep flushing until it drains.
    // 如果queue或pendingPostFlushCbs有待执行的任务，递归执行
    if (queue.length || pendingPostFlushCbs.length) {
      flushJobs(seen)
    }
  }
}
```

`watch effect`副作用函数可以通过它的`scheduler`指定刷新时机，默认为组件更新后，如果配置为组件更新前，可以避免一次渲染，这是因为在渲染组件`effect`执行前，`watch effect`已经执行了，`data.flag`被修改为`true`，会渲染为最终正确结果，所以灵活运用它的刷新时机，可以进行性能优化。