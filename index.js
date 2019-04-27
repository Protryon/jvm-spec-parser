
const fs = require('fs');

const jvm_spec = fs.readFileSync('./jvm_spec.html', 'UTF-8');

const htmlparser = require("htmlparser");

const handler = new htmlparser.DefaultHandler((error, dom) => {
    if (error) {
        console.error(error);
        process.exit(1);
    }
    extractSpec(dom);

});

const manualImplementation = ["lookupswitch", "tableswitch", "wide"];

new htmlparser.Parser(handler).parseComplete(jvm_spec);


function extractSpec(dom) {
    let instructions = {};
    dom.forEach(element => {
        if (element.attribs.class != "section-execution") return;
        let title = element.attribs.title;
        let instruction = instructions[title] = { dom: element.children };
    });
    Object.keys(instructions).forEach(name => {
        let ins = instructions[name];
        if (manualImplementation.includes(name)) {
            ins.manual = true;
            delete ins.dom;
            return;
        }
        let newDom = {};
        for (let child of ins.dom) {
            if (!('attribs' in child)) {
                continue;
            }
            if (child.attribs.title == "Forms") {
                newDom.form = child.children;
            } else if (child.attribs.title == "Format" || child.attribs.title == "Format 1") {
                newDom.format = child.children;
            } else if (child.attribs.title == "Operand Stack") {
                newDom.stack = child.children;
            } else if (child.attribs.title == "Description") {
                newDom.description = child.children;
            } else if (child.attribs.title == "Run-time Exceptions") {
                newDom.runtimeExceptions = child.children;
            } else if (child.attribs.title == "Notes") {
                newDom.notes = child.children;
            }
        }
        ins.dom = newDom;
        if (!('format' in ins.dom)) {
            console.log('err on ' + name + ': no format');
            return;
        }
        
        let wideable = ins.dom.notes != null ? [].concat.apply([], ins.dom.notes
            .filter(x => x.name == 'p' && x.attribs.class === 'norm')
            .map(x => x.children))
            .filter(x => x.name === 'a' && x.attribs.title === 'wide').length > 0 : false;

        let format = ins.dom.format[1].children[0].children.filter(x => x.name === 'span').slice(1); // ignore opcode
        format = format.map(x => x.children[0].children[0].data);
        let args = [];
        let counter = 1;
        let currentArgName = void 0;
        for (let arg of format) {
            if (currentArgName === void 0) {
                currentArgName = arg.replace(/[0-9]+$/, '');
            }
            if (arg.startsWith(currentArgName) && arg.slice(currentArgName.length) == counter) {
                ++counter;
            } else {
                if (counter == 1) {
                    args.push({name: arg, width: 1});
                } else {
                    args.push({name: currentArgName, width: counter - 1});
                }
                counter = 1;
                currentArgName = void 0;
            }
        }
        if (counter > 1) {
            args.push({name: currentArgName, width: counter - 1});
        }
        if (wideable) {
            args.forEach(arg => {
                arg.wwidth = arg.width * 2;
            });
        }
        ins.args = args;

        let stack = ins.dom.stack.slice(1)
            .map(x => x.children.filter(y => y.name == 'span' && y.attribs.class == 'emphasis'));
        if (stack.length != 2) {
            ins.popped = [];
            ins.pushed = [];
        } else {
            ins.popped = stack[0].map(x => x.children[0].children[0].data);
            ins.pushed = stack[1].map(x => x.children[0].children[0].data);    
        }

        let forms = ins.dom.form.slice(1).map(x => x.children);
        forms = forms.map(f => {
            if (!('children' in f[0])) {
                let match = f[0].data.match(/([a-zA-Z0-9]+) = ([0-9]+)/);
                return {name: match[1], opcode: match[2]};
            }
            return {name: f[0].children[0].children[0].data, opcode: f[1].data.match(/ = ([0-9]+)/)[1]};
        });
        ins.forms = forms;
        delete ins.dom;
    });

    console.log(JSON.stringify(instructions, null, 2));
