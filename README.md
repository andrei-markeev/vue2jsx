# vue2jsx

Convert Vue html templates to their JSX representation.

Usage:

```
npm i -g vue2jsx
vue2jsx my-component.vue > my-component.tsx
```

**Note**: some post-processing is usually necessary after the conversion.

## Example

The following Vue SFC:
```html
<script>
    export default {
        data() {
            return {
                user: null,
                users: null
            }
        }
    }
</script>

<template>
    <div>
        <h1 v-if="user">Hello, {{user.name}}!</h1>
        <div v-else-if="users">
            Hello to all of you:
            <ul>
                <li v-for="u in users" v-bind:key="u.id">u.name</li>!
            </ul>
        </div>
        <h1 v-else>Hello, anonymous!</h1>
    </div>
</template>

<style>
    h1 { color: green }
</style>
```

results in this output:

```jsx
const render = function(h) { return (
    <div>
        { this.user ? <h1>Hello, { this.user.name }!</h1>
         : this.users ? <div>
            Hello to all of you:
            <ul>
                { this.users.map(u => <li key={ u.id }>u.name</li>) }!
            </ul>
        </div>
         : <h1>Hello, anonymous!</h1> }
    </div>
}
```