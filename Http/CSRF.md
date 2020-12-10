CSRF（Cross-site request forgery）跨站请求伪造：

1. 受害者登录银行网站，进行转账操作，保留了受害者登录凭证cookie
2. 攻击者诱导受害者进入了攻击者的网站
3. 攻击者的网站向银行网站发送了1个转账请求，并携带了受害者的登录凭证
4. 银行网站对这个请求验证，确认了受害者的身份，误以为是受害者发送的请求
5. 执行了该请求，受害者钱被转走了

特点：

* **攻击者不能获取受害者cookie，只是使用**
* 攻击**通常**在第三方网站进行

### CSRF常见的类型

* GET类型

```javascript
 <img src="http://bank.example/withdraw?amount=10000&for=hacker" > 
```

受害者进入的攻击这网站，会发送`http://bank.example/withdraw?amount=10000&for=hacker`请求。

* POST类型，表单提交

```html
 <form action="http://bank.example/withdraw" method=POST>
    <input type="hidden" name="account" value="xiaoming" />
    <input type="hidden" name="amount" value="10000" />
    <input type="hidden" name="for" value="hacker" />
</form>

<script> document.forms[0].submit(); </script> 
```

访问该页面后，表单会自动提交，相当于模拟用户完成了一次POST操作。

* 链接类型

```html
<a href="http://test.com/csrf/withdraw.php?amount=1000&for=hacker" taget="_blank">重磅消息！<a/>
```

链接类型的CSRF并不常见，比起其他两种用户打开页面就中招的情况，这种需要用户点击链接才会触发。

这种类型通常是在论坛中发布的图片中嵌入恶意链接，或者以广告的形式诱导用户中招，攻击者通常会以比较夸张的词语诱骗用户点击。

### 防护策略

#### 同源检测

通常情况，CSRF都是非同源请求，请求会携带的Origin和referer，服务器通过判断这2个首部确定请求的来源是否可信。

* Origin

1. Origin首部指定请求来自哪个站点，不包含路径和参数信息
2. Origin首部用于CORS请求和POST请求

* referer

1. 对于Ajax请求，图片和script等资源请求，Referer为发起请求的页面地址。
2. 对于页面跳转，Referer为打开页面历史记录的前一个页面地址。

#### CSRF Token

由于CSRF不能获取受害者cookie，而是直接使用，我们要求用户的请求携带1个攻击者无法获取的Token，服务器通过请求是否携带正确的Token来区分正常请求和攻击请求。

1. 用户登陆后，服务器返回加密的CSRF Token
2. 页面提交的请求携带这个Token
3. 服务器验证Token是否正确

#### 双重Cookie验证

1. 服务器发送的Cookie到前端
2. 前端发送请求时，取出Cookie添加到URL参数中
3. 后端接口验证Cookie中的字段与URL中的参数是否相同，不同则拒绝请求



### 参考文章

1. [前端安全系列之二：如何防止CSRF攻击？](https://juejin.cn/post/6844903689702866952)
2. [MDN Referer](https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Headers/Referer)
3. [MDN Origin](https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Headers/Origin)

