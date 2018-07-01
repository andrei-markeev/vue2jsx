type Dictionary<T> = { [key: string]: T };
type Nullable<T> = T | null;

class ParsedNode {

    constructor(public tagName: string = "", public parentNode: Nullable<ParsedNode> = null) { }

    childNodes: ParsedNode[] = [];
    startText: string = "";
    endText: string = "";
    startIf: boolean = false;
    condition: string = "";
    postProcessor: { (text: string): string } = t => t;

    appendChild(tagName: string) {
        var newNode = new ParsedNode(tagName, this);
        this.childNodes.push(newNode);
        return newNode;
    }

    render() {
        let jsx;
        if (this.startText == "<template>")
        {
            jsx = '[ ';
            for(let i = 0; i < this.childNodes.length; i++) {
                const child = this.childNodes[i];
                jsx += child.render();
                if (child.tagName != "#text")
                    jsx += ", ";
            }
            jsx = jsx.replace(/,(\s*)$/, '$1') + ' ]';
        }
        else
        {
            jsx = this.startText;

            for(let i = 0; i < this.childNodes.length; i++) {
                const child = this.childNodes[i];
                jsx += child.render();
            }

            jsx += this.endText;
        }

        return this.postProcessor(jsx);
    }
}


function vue2jsx(html: string) {
    var startTagRegex = /^<(!?[-A-Za-z0-9_]+)((?:\s+[\w\-\:\.]+(?:\s*=\s*(?:(?:"[^"]*")|(?:'[^']*')|[^>\s]+))?)*)\s*(\/?)>/,
        endTagRegex = /^<\/([-A-Za-z0-9_]+)[^>]*>/;
    var attrRegex = /\s*[\w\-\:\.]+(?:\s*=\s*(?:(?:"[^"]*")|(?:'[^']*')|[^>\s]+))?/g;
    var special: Dictionary<number> = { script: 1, style: 1 };
    var index, chars, match, stack: any[] & { last?: Function } = [], last = html;
    stack.last = function () {
        return this[this.length - 1];
    };
    var currentNode = new ParsedNode();
    var rootNode = currentNode;

    while (html) {
        chars = true;

        // Make sure we're not in a script or style element
        if (!stack.last() || !special[stack.last()]) {

            // Comment
            if (html.indexOf("<!--") == 0) {
                index = html.indexOf("-->");

                if (index >= 0) {
                    html = html.substring(index + 3);
                    chars = false;
                }

                // end tag
            } else if (html.indexOf("</") == 0) {
                match = html.match(endTagRegex);

                if (match) {
                    html = html.substring(match[0].length);
                    currentNode.endText = match[0];
                    currentNode = currentNode.parentNode!;
                    chars = false;
                }

                // start tag
            } else if (html.indexOf("<") == 0) {
                match = html.match(startTagRegex);

                if (match) {
                    html = html.substring(match[0].length);
                    currentNode = currentNode.appendChild(match[1]);
                    let startTagJsx = "";
                    let attrsMatch = match[2].match(attrRegex);
                    let attrsJsx = "";
                    if (attrsMatch) {
                        for (var i = 0; i < attrsMatch.length; i++) {
                            if (attrsMatch[i].replace(/^\s+/, '') == '')
                                continue;

                            let name = attrsMatch[i].replace(/=.*/, '').replace(/^\s+/, '');
                            let value = attrsMatch[i].replace(/^[^=]+=/, '');
                            let jsxAttr = name + "=" + value;

                            if (attrsMatch[i].indexOf('=') === -1) {
                                name = value.replace(/^\s+/, '');
                                value = '';
                                jsxAttr = name;
                            }

                            if (name.indexOf("v-on:") == 0) {

                                name = "on" + name.substr(5);
                                value = value.slice(1, -1);
                                const funcMatch = value.match(/^\s*[a-z][A-Za-z_0-9]*\s*\(([^)]*)\)\s*$/);
                                if (funcMatch && funcMatch[1])
                                    value = "() => this." + value.replace(/^\s+/, '');
                                else if (funcMatch)
                                    value = "this." + value.replace(/^\s+/, '').replace(/\s*\(\)\s*$/, '');
                                else
                                    value = "/*REVIEW*/ " + value;

                                jsxAttr = name + "={ " + value + " }";

                            } else if (name.indexOf("v-bind:") == 0) {

                                name = name.substr(7);
                                jsxAttr = name + "={ " + value.slice(1, -1) + " }";

                            } else if (name == "v-for") {

                                let [elem, elems] = value.slice(1, -1).split(' in ');
                                if (elem.indexOf(',') > -1 && elem.indexOf('(') == -1)
                                    elem = "(" + elem + ")";
                                jsxAttr = "";
                                currentNode.postProcessor = t => `{ this.${elems}.map(${elem} => ${t}) }`;

                            } else if (name == "v-if") {

                                jsxAttr = "";
                                const condition = value.slice(1, -1);
                                currentNode.startIf = true;
                                currentNode.condition = condition;
                                currentNode.postProcessor = t => `{ ${condition} && ${t} }`;

                            } else if (name == "v-else-if") {

                                jsxAttr = "";
                                const children = currentNode.parentNode.childNodes.filter(n => n.tagName != "#text");
                                const prevNode = children[children.length - 2];
                                const condition = value.slice(1, -1);
                                currentNode.condition = condition;
                                if (prevNode.startIf)
                                    prevNode.postProcessor = t => `{ ${prevNode.condition} ? ${t}`;
                                else
                                    prevNode.postProcessor = t => ` : ${prevNode.condition} ? ${t}`;

                                currentNode.postProcessor = t => ` : ${condition} ? ${t} : null }`;

                            } else if (name == "v-else") {

                                jsxAttr = "";
                                const children = currentNode.parentNode.childNodes.filter(n => n.tagName != "#text");
                                const prevNode = children[children.length - 2];
                                if (prevNode.startIf)
                                    prevNode.postProcessor = t => `{ ${prevNode.condition} ? ${t}`;
                                else
                                    prevNode.postProcessor = t => ` : ${prevNode.condition} ? ${t}`;

                                currentNode.postProcessor = t => ` : ${t} }`;

                            } else if (name == "v-model") {

                                const oninput = match[1] == 'input' || match[1] == 'textarea' ? "oninput" : "onchange";
                                const model = "this." + value.slice(1, -1);
                                jsxAttr = `value={ ${model} } ${oninput}={ e => ${model} = e.target.value }`;

                            }

                            if (jsxAttr)
                                attrsJsx += " " + jsxAttr;
                        }
                    }
                    startTagJsx += "<" + match[1] + attrsJsx + match[match.length - 1] + ">";
                    currentNode.startText = startTagJsx;
                    if (match[match.length - 1] == "/")
                        currentNode = currentNode.parentNode!;
                    chars = false;
                }
            }

            if (chars) {
                index = html.indexOf("<");

                var text = index < 0 ? html : html.substring(0, index);
                html = index < 0 ? "" : html.substring(index);

                let textNode = currentNode.appendChild("#text");
                textNode.startText = text.replace(/{{\s*([^}]+)\s*}}/g, "{ $1 }");
            }

        } else {
            html = html.substring(html.indexOf("</" + stack.last() + ">"));
        }

        if (html == last) {
            throw new Error("Parse Error at: " + html)
        }
        last = html;
    }

    return rootNode;

}

module.exports = vue2jsx;