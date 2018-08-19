
import ts from 'typescript';

type Dictionary<T> = { [key: string]: T };
type Nullable<T> = T | null;
class ParsedNode {

    constructor(public tagName: string = "", public parentNode: Nullable<ParsedNode> = null) { }

    localVariables: string[] = [];
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

                            let tagName = match[1];
                            let name = attrsMatch[i].replace(/=.*/, '').replace(/^\s+/, '');
                            let value = attrsMatch[i].replace(/^[^=]+=/, '');
                            if (attrsMatch[i].indexOf('=') === -1)
                                value = true;

                            let attrJsx = processAttr(tagName, name, value, currentNode);

                            if (attrJsx)
                                attrsJsx += " " + attrJsx;
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

function processAttr(tagName: string, name: string, value: string | true, currentNode: ParsedNode) {
    let jsxAttr = name + "=" + value;
    if (value === true) {
        jsxAttr = name;
    }
    else if (name.indexOf("v-on:") == 0) {
        name = "on" + name.substr(5);
        value = processJs(value.slice(1, -1).replace(/^\s+/, ''), currentNode);

        let param = "()";
        let condition = "";
        if (name.endsWith(".enter")) {
            name = name.slice(0, -6);
            param = "e";
            condition = "e.keyCode == 13";
        }

        if (value.indexOf(';') === -1)
            value = `${param} => ${condition ? condition + " && " : ""}${value}`;
        else if (condition)
            value = `${param} => { if (${condition}) { ${value} } }`;
        else
            value = `${param} => { ${value} }`;

        jsxAttr = name + "={ " + value + " }";
    }
    else if (name.indexOf("v-bind:") == 0) {
        name = name.substr(7);
        jsxAttr = name + "={ " + processJs(value.slice(1, -1), currentNode) + " }";
    }
    else if (name == "v-for") {
        let [elem, elems] = value.slice(1, -1).split(' in ');
        if (elem.indexOf(',') > -1 && elem.indexOf('(') == -1)
            elem = "(" + elem + ")";
        jsxAttr = "";
        currentNode.localVariables = elem.replace(/^\(|\)$|\s+/g, '').split(',');
        currentNode.postProcessor = t => `{ this.${elems}.map(${elem} => ${t}) }`;
    }
    else if (name == "v-if") {
        jsxAttr = "";
        const condition = processJs(value.slice(1, -1), currentNode);
        currentNode.startIf = true;
        currentNode.condition = condition;
        currentNode.postProcessor = t => `{ ${condition} && ${t} }`;
    }
    else if (name == "v-else-if") {
        jsxAttr = "";
        const children = currentNode.parentNode.childNodes.filter(n => n.tagName != "#text");
        const prevNode = children[children.length - 2];
        const condition = processJs(value.slice(1, -1), currentNode);
        currentNode.condition = condition;
        if (prevNode.startIf)
            prevNode.postProcessor = t => `{ ${prevNode.condition} ? ${t}`;
        else
            prevNode.postProcessor = t => ` : ${prevNode.condition} ? ${t}`;
        currentNode.postProcessor = t => ` : ${condition} ? ${t} : null }`;
    }
    else if (name == "v-else") {
        jsxAttr = "";
        const children = currentNode.parentNode.childNodes.filter(n => n.tagName != "#text");
        const prevNode = children[children.length - 2];
        if (prevNode.startIf)
            prevNode.postProcessor = t => `{ ${prevNode.condition} ? ${t}`;
        else
            prevNode.postProcessor = t => ` : ${prevNode.condition} ? ${t}`;
        currentNode.postProcessor = t => ` : ${t} }`;
    }
    else if (name == "v-model") {
        const oninput = tagName == 'input' || tagName == 'textarea' ? "oninput" : "onchange";
        const model = processJs(value.slice(1, -1), currentNode);
        jsxAttr = `value={ ${model} } ${oninput}={ e => ${model} = e.target.value }`;
    }
    return jsxAttr;
}

function processJs(jsCode: string, currentNode: ParsedNode)
{
    let fileNode = ts.createSourceFile("test.ts", "(" + jsCode + ")", ts.ScriptTarget.ES5);

    let localVariables = [];
    while (currentNode.parentNode) {
        currentNode = currentNode.parentNode;
        localVariables = localVariables.concat(currentNode.localVariables);
    }

    let positions: number[] = [];
    analyse(fileNode);
    positions
        .map(p => fixPos(--p))
        .filter(p => /[a-z$_]/.test(jsCode.substr(p, 1)))
        .filter(p => localVariables.indexOf(jsCode.substr(p).match(/^[a-zA-Z$_]+/)[0]) == -1)
        .sort((a, b) => b - a)
        .forEach(p => jsCode = jsCode.substr(0, p) + "this." + jsCode.substr(p));
    return jsCode;

    function analyse(node: ts.Node)
    {
        if (node.kind == ts.SyntaxKind.ParenthesizedExpression) {
            const expr = <ts.ParenthesizedExpression>node;
            if (expr.expression.kind == ts.SyntaxKind.Identifier)
                positions.push(expr.expression.pos);
        }       
        if (node.kind == ts.SyntaxKind.ElementAccessExpression
            || node.kind == ts.SyntaxKind.PropertyAccessExpression) {
            positions.push(node.pos);
            return;
        }
        if (node.kind == ts.SyntaxKind.CallExpression && (<ts.CallExpression>node).expression.kind == ts.SyntaxKind.Identifier)
            positions.push(node.pos);
        if (node.kind == ts.SyntaxKind.BinaryExpression) {
            const binExpr = <ts.BinaryExpression>node;
            if (binExpr.right.kind == ts.SyntaxKind.Identifier)
                positions.push(binExpr.right.pos);
            if (binExpr.left.kind == ts.SyntaxKind.Identifier)
                positions.push(binExpr.left.pos);
        }
        ts.forEachChild(node, analyse);
    }

    function fixPos(pos) {
        while(/\s/.test(jsCode.substr(pos, 1)) && pos < jsCode.length)
            pos++;

        return pos;
    }

}

export = vue2jsx;