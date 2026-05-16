let split = null;

browser.runtime.onMessage.addListener((message) => {
    if (message.action === "applyGradient") {
        applyGradient(setLines());

    } else if (message.action === "resetStyle") {
        if (split) {
            split.revert();
            split = null;
        }
    }
    else if (message.action === "changeMode") {
        if (split) {
            applyGradient(split, message.mode);
        }
        else {
            applyGradient(setLines(), message.mode);
        }
    }
});

function getTextElements() {
    const textElements = $("p")
        .addBack()
        .contents()
        .map(function () {
            return $(this).parent().get(0);
        })
        .uniqueSort();

    return textElements;
}

function setLines() {
    if (split) {
        split.revert();
        split = null;
    }

    split = SplitText.create(getTextElements(), {
        type: "lines",
        linesClass: " ++",
        aria: "none",
        deepSlice: false
    });

    return split;
}

function applyGradient(split, mode) {
    const even = [];
    const odd = [];

    split.lines.forEach((line) => {
        (parseInt(line.getAttribute("class")) % 2 === 0 ? even : odd).push(line);
    });

    if (mode == "dark") {
        if (even.length) {
            gsap.set(even, {
                background: "linear-gradient(to right, #2471a3 0%, #e4e4e4 50%, #c0392b 100%)",
                textFillColor: "transparent",
                width: "fit-content",
            });
        }
        if (odd.length) {
            gsap.set(odd, {
                background: "linear-gradient(to right, #c0392b 0%, #e4e4e4 50%, #2471a3 100%)",
                textFillColor: "transparent",
                width: "fit-content",
            });
        }
    }
    else {
        if (even.length) {
            gsap.set(even, {
                background: "linear-gradient(to right, #2471a3 0%, #1a1a1a 50%, #c0392b 100%)",
                textFillColor: "transparent",
                width: "fit-content",
            });
        }

        if (odd.length) {
            gsap.set(odd, {
                background: "linear-gradient(to right, #c0392b 0%, #1a1a1a 50%, #2471a3 100%)",
                textFillColor: "transparent",
                width: "fit-content",
            });
        }
    }

    split.lines.forEach((line) => {
        line.style.backgroundClip = "text";
    });
}