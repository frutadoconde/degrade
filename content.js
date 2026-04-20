let textNodeElements = $("body")
    .find("*")
    .addBack()
    .contents()
    .filter(function () {
        return (
            this.nodeType === 3 &&
            $(this)
                .parent()
                .is(":not(script, style, button, input, h1, h2, h3, h4, h5, h6)") &&
            this.nodeValue.trim() !== ""
        );
    })
    .map(function () {
        return $(this).parent().get(0);
    })
    .uniqueSort();

browser.runtime.onMessage.addListener((message) => {
    const elements = textNodeElements.toArray();

    if (message.action === "applyGradient") {
        console.log("applyGradient");
        const hasGradients = elements.some(
            (el) => el._fg !== null && el._fg !== undefined,
        );
        if (hasGradients) {
            textNodeElements.each(function () {
                this._fg?.destroy();
                this._fg = null;
            });
        }
        scheduleGradients(elements);
    } else if (message.action === "resetStyle") {
        textNodeElements.each(function () {
            this._fg?.destroy();
            this._fg = null;
        });
    } else if (message.action === "changeMode") {
        const hexColor = message.mode === "light" ? "#ffffff" : "#1a1a1a";
        const hasGradients = elements.some(
            (el) => el._fg !== null && el._fg !== undefined,
        );

        if (!hasGradients) {
            scheduleGradients(elements, { colorMid: hexColor });
        } else {
            textNodeElements.each(function () {
                this._fg?.update({ colorMid: hexColor });
            });
        }
    }
});

function scheduleGradients(elements, options = {}) {
    const queue = elements.map((el) => {
        const fg = flowGradient(el, options);
        el._fg = fg;
        return { element: el, fg };
    });

    let pendingWrites = [];
    let rafScheduled = false;

    function flushWrites() {
        rafScheduled = false;
        const batch = pendingWrites.splice(0);
        for (const write of batch) write();
    }

    function scheduleWrite(fn) {
        pendingWrites.push(fn);
        if (!rafScheduled) {
            rafScheduled = true;
            requestAnimationFrame(flushWrites);
        }
    }

    function processQueue(deadline) {
        while (queue.length > 0 && deadline.timeRemaining() > 1) {
            const { fg } = queue.shift();
            const write = fg.measure();
            if (write) scheduleWrite(write);
        }
        if (queue.length > 0) {
            requestIdleCallback(processQueue, { timeout: 500 });
        }
    }

    requestIdleCallback(processQueue, { timeout: 500 });
}

function flowGradient(element, options = {}) {
    const cfg = {
        colorA: options.colorA ?? "#c0392b",
        colorB: options.colorB ?? "#2471a3",
        colorMid: options.colorMid ?? "#1a1a1a",
        midStop: options.midStop ?? 50,
    };

    let originalHTML = null;
    let resizeObserver = null;
    let rafId = null;
    let idleCallbackId = null;

    function detectLines(textNode) {
        const text = textNode.textContent;
        const range = document.createRange();
        const lines = [];
        let lineStart = 0;
        let lastTop = null;

        for (let i = 0; i < text.length; i++) {
            range.setStart(textNode, i);
            range.setEnd(textNode, i + 1);
            const rect = range.getBoundingClientRect();

            if (rect.width === 0 && rect.height === 0) continue;

            const top = Math.round(rect.top);

            if (lastTop === null) {
                lastTop = top;
            } else if (top > lastTop + 2) {
                lines.push({ start: lineStart, end: i });
                lineStart = i;
                lastTop = top;
            }
        }

        if (lineStart < text.length) {
            lines.push({ start: lineStart, end: text.length });
        }

        return lines;
    }

    function gradientForLine(lineIndex) {
        const even = lineIndex % 2 === 0;
        const from = even ? cfg.colorA : cfg.colorB;
        const to = even ? cfg.colorB : cfg.colorA;
        return `linear-gradient(to right, ${from} 0%, ${cfg.colorMid} ${cfg.midStop}%, ${to} 100%)`;
    }

    function collectMeasurements(node, lineCounter, results) {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent;
            if (!text.trim()) return lineCounter;

            const lines = detectLines(node);
            if (lines.length === 0) return lineCounter;

            results.push({ node, text, lines, lineOffset: lineCounter });
            return lineCounter + lines.length;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            let counter = lineCounter;
            for (const child of Array.from(node.childNodes)) {
                counter = collectMeasurements(child, counter, results);
            }
            return counter;
        }

        return lineCounter;
    }

    function buildFragment(text, lines, lineOffset) {
        const fragment = document.createDocumentFragment();

        lines.forEach((line, i) => {
            const span = document.createElement("span");
            span.dataset.fgLine = lineOffset + i;
            span.textContent = text.slice(line.start, line.end);

            span.style.cssText = [
                `background: ${gradientForLine(lineOffset + i)}`,
                "-webkit-background-clip: text",
                "background-clip: text",
                "-webkit-text-fill-color: transparent",
                "color: transparent",
                "display: inline",
                "white-space: pre-wrap",
            ].join("; ");

            fragment.appendChild(span);
        });

        return fragment;
    }

    function measure() {
        if (originalHTML === null) {
            originalHTML = element.innerHTML;
        } else {
            element.innerHTML = originalHTML;
        }

        const measurements = [];
        collectMeasurements(element, 0, measurements);
        if (measurements.length === 0) return null;

        return function commitWrites() {
            for (let i = measurements.length - 1; i >= 0; i--) {
                const { node, text, lines, lineOffset } = measurements[i];
                if (!node.parentNode) continue;
                node.parentNode.replaceChild(
                    buildFragment(text, lines, lineOffset),
                    node,
                );
            }
            watchResize();
        };
    }

    function apply() {
        if (idleCallbackId) {
            cancelIdleCallback(idleCallbackId);
            idleCallbackId = null;
        }
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }

        idleCallbackId = requestIdleCallback(
            () => {
                const write = measure();
                if (write) rafId = requestAnimationFrame(write);
            },
            { timeout: 500 },
        );
    }

    function watchResize() {
        if (resizeObserver) return;
        resizeObserver = new ResizeObserver(() => {
            if (rafId) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(apply);
        });
        resizeObserver.observe(element);
    }

    function update(newOptions) {
        Object.assign(cfg, newOptions);
        if (originalHTML === null) return;
        element.innerHTML = originalHTML;
        apply();
    }

    function destroy() {
        if (resizeObserver) {
            resizeObserver.disconnect();
            resizeObserver = null;
        }
        if (idleCallbackId) cancelIdleCallback(idleCallbackId);
        if (rafId) cancelAnimationFrame(rafId);
        if (originalHTML !== null) {
            element.innerHTML = originalHTML;
            originalHTML = null;
        }
    }

    return { measure, apply, update, destroy };
}
