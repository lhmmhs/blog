### 1. CSS选择器

* id选择器
* class类选择器
* 标签选择器
* 后代选择器
* 相邻后代选择器 `div>span`
* 兄弟选择器`div~span`
* 相邻兄弟选择器`div+span`
* 属性选择器
* 伪类选择器，表示元素状态，这个状态是根据用户行为而动态变化的
* 伪元素选择器，是1个元素，不在文档树中的元素
* 通配符选择器

###　2. CSS可以继承的属性

* 字体系列属性font、font-family、font-weight、font-size、font-style
* 文字系列属性text-indent、text-align、text-shadow、line-height、color
* 光标属性cursor
* 属性不可继承时，可以使用inherit关键字指定一个属性应从父元素继承它的值

###　3. 弹性布局

* 任何一个容器都可以指定为 Flex 布局。

* 容器设为 Flex 布局以后，子元素的`float`、`clear`和`vertical-align`属性将失效。

* 容器的子元素被称为项目

* 容器的6个属性

 ```css
flex-direction /* 主轴方向 */
flex-wrap /* 换行规则 */
flex-flow /* flex-direction flex-wrap缩写属性 */
justify-content /* 主轴对齐方式 */
align-items /* 交叉轴对齐方式 */
align-content /* 多个交叉轴对齐方式 */
 ```

* 项目6个属性

```css
order /* 项目的排列顺序 */
flex-grow /* 项目的放大比例 */
flex-shrink /* 计算项目缩小比例的相关值 */
flex-basis /* 主轴项目在放大或缩小之前的长度 */
flex /* flex-grow flex-shrink flex-basis缩写 */
align-self /* 单个项目与其他项目不一样的对齐方式 */
```

```javascript
// 项目缩小比例 = 单个子元素的缩小宽度 / 所有单个子元素缩小宽度
flex-shrink x flex-basis / Σ(flex-shrink x flex-basis)
```

###　4. BFC

* BFC是指块级格式化上下文
* BFC容器的子元素不会影响外部
* BFC的触发条件
	1. 根元素
   	2. 浮动元素
   	3. 绝对定位元素
   	4. overflow为auto、scroll 或 hidden
   	5. display 的值为 table-cell、table-caption 和 inline-block 中的任何一个

* 作用
  1. 清除浮动
  2. 清除margin重叠

###　5. IFC

* IFC是值内联格式上下文
* 内联盒子在水平方向，相邻放置，空间不够时自动换行
* **行级行框盒子高度**由最高的**内联盒子**决定

###　6. 替换元素

通过修改某个属性的值可以改变呈现内容的元素称为替换元素。例如：

```html
<img src="" />
<input type="text" value="" />
<iframe src="" />
<video src="" />
```

特性：

* 内容的外观不受页面上的 CSS 的影响，select下拉没法设置样式
* 有自己的尺寸，video，iframe默认尺寸300*150
* 在很多 CSS 属性上有自己的一套表现规则

替换元素尺寸计算规则：

* 固有尺寸，图片，视频自己的尺寸
* HTML尺寸，通过元素的属性改变
* CCS尺寸

### 7. 层叠上下文

特性：

* 在Z轴上拥有层叠上下文的元素比普通元素显示顺序高
* 层叠上下文可以嵌套，后代元素受限制于祖先元素
* 兄弟元素的层叠上下文相互独立
* 每个层叠上下文自称体系，元素发生层叠的时候，整个元素被认为是在父层叠上下文的层叠顺序中

触发条件：

* 根元素
* 定位元素，z-index为数值
* 弹性布局，z-index不是auto
* opacity值不是1
* transform值不是none

### 8. 绝对定位元素与非绝对定位元素宽高百分比计算区别

* 绝对定位元素宽高百分比相对**定位祖先元素**的padding box计算
* 非绝对定位元素宽高百分比相对父元素的content box计算