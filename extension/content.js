let autofillAlreadyExecuted = false;
const autofilledValues = new Map();
const userEditedFields = new WeakSet();
const saveLock = new WeakSet();
const saveCooldown = new Map();
const autofillClearingFields = new WeakSet();

async function runAutoFill() {

    if (autofillAlreadyExecuted) {
        console.log("AutoFiller: Already executed, skipping...");
        return;
    }

    autofillAlreadyExecuted = true;

    console.log("AutoFiller: Starting scan...");

    // Universal check: any input or textarea?
    if (!document.querySelector('input, textarea')) {
        console.log("AutoFiller: No form fields detected.");
        return;
    }

    const normalizeLabel = (label) => {
        return label
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')  // remove ALL punctuation
            .replace(/\s+/g, '_')
            .trim();
    };

    async function saveFieldToProfile(labelText, value, token) {
        try {
            await fetch('http://localhost:5000/api/profiles/save-field', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    key: normalizeLabel(labelText),
                    value: value
                })
            });
            console.log("AutoFiller: Field saved to profile");
        } catch (err) {
            console.error("AutoFiller: Failed to save field", err);
        }
    }

    const getLabelText = (input) => {

        // PRIORITY 0: Google Forms detection
        const gContainer = input.closest('[role="listitem"]');
        if (gContainer) {
            const gLabel = gContainer.querySelector('[role="heading"], .M7eMe, .HoXoMd');
            if (gLabel && gLabel.innerText.trim()) {
                return gLabel.innerText.trim();
            }
        }

        // PRIORITY 1: Standard HTML label using for="id"
        if (input.id) {
            const label = document.querySelector(`label[for="${input.id}"]`);
            if (label && label.innerText.trim()) {
                return label.innerText.trim();
            }
        }

        // PRIORITY 2: input.labels property
        if (input.labels && input.labels.length > 0) {
            const text = input.labels[0].innerText.trim();
            if (text) return text;
        }

        // PRIORITY 3: aria-label
        const aria = input.getAttribute("aria-label");
        if (aria && aria.trim() && aria.toLowerCase() !== "your answer") {
            return aria.trim();
        }

        // PRIORITY 4: wrapped label
        const parentLabel = input.closest("label");
        if (parentLabel && parentLabel.innerText.trim()) {
            return parentLabel.innerText.trim();
        }

        // PRIORITY 5: placeholder
        if (input.placeholder && input.placeholder.trim()) {
            return input.placeholder.trim();
        }

        // PRIORITY 6: name attribute
        if (input.name && input.name.trim()) {
            return input.name.trim();
        }

        // PRIORITY 7: Previous Sibling Traversal (Text Nodes & Elements)
        // Handles: "Name: <input>", "<span>Name</span><br><input>", etc.
        let sibling = input.previousSibling;
        let depth = 0;
        while (sibling && depth < 3) { // Check previous 3 siblings max
            // 1. Text Node
            if (sibling.nodeType === Node.TEXT_NODE && sibling.textContent.trim()) {
                return sibling.textContent.trim();
            }
            // 2. Element Node
            if (sibling.nodeType === Node.ELEMENT_NODE) {
                // Ignore BR tags, continue searching backwards
                if (sibling.tagName === 'BR') {
                    sibling = sibling.previousSibling;
                    depth++;
                    continue;
                }
                // If standard element with text (e.g. span, b, strong)
                if (sibling.innerText && sibling.innerText.trim()) {
                    return sibling.innerText.trim();
                }
            }
            sibling = sibling.previousSibling;
            depth++;
        }

        // PRIORITY 8: Parent Text Fallback
        // Handles: "<div>Name <input></div>" where no label tag exists
        if (input.parentElement && input.parentElement.tagName !== 'BODY' && input.parentElement.tagName !== 'FORM') {
            // Get immediate parent text, removing the input's own value detection
            const clone = input.parentElement.cloneNode(true);
            const childInputs = clone.querySelectorAll('input, select, textarea');
            childInputs.forEach(el => el.remove()); // Remove inputs to get only text
            
            const text = clone.innerText.trim();
            if (text && text.length > 0 && text.length < 50) {
                return text;
            }
        }

        // PRIORITY 9: id fallback
        if (input.id && input.id.trim()) {
            return input.id.trim();
        }

        return null;
    };

    // 1. Collect all inputs (Short answer, Long answer, etc.)
    const inputs = Array.from(document.querySelectorAll(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select, div[contenteditable="true"]'
    ))
        .filter(el => {
            return el.offsetParent !== null; // Filter out hidden inputs
        });

    const formFields = [];
    const labels = [];

    for (const inputElement of inputs) {
        const labelText = getLabelText(inputElement);
        if (labelText) {
            const normalized = normalizeLabel(labelText);
            formFields.push({ 
                originalLabel: labelText, 
                normalizedLabel: normalized, 
                inputElement 
            });
            labels.push(normalized);
            console.log(`Mapped: "${labelText}" (normalized: "${normalized}") ->`, inputElement);
        }
    }

    /* ===============================
    ADD GOOGLE RADIO LABELS TO MATCHFIELDS
    =============================== */

    const googleRadioContainers =
    document.querySelectorAll('[role="listitem"]');

    googleRadioContainers.forEach(container => {

        const labelElement =
            container.querySelector('[role="heading"], .M7eMe, .HoXoMd');

        if (!labelElement) return;

        const originalLabel = labelElement.innerText.trim();

        if (!originalLabel) return;

        const normalized = normalizeLabel(originalLabel);

        if (!labels.includes(normalized)) {

            labels.push(normalized);

            console.log(
                "AutoFiller: Added Google radio label to matchFields:",
                normalized
            );

        }

    });

    /* ===============================
    END FIX
    =============================== */

    console.log(`Found ${formFields.length} mapped fields from ${inputs.length} detected inputs.`);


    if (formFields.length === 0) {
        console.log("AutoFiller: No labeled fields found.");
        return;
    }

    // 4. Send labels to backend to get values
    // Retrieve token first
    chrome.storage.local.get(['token'], (result) => {
        const token = result.token;
        if (!token) {
            console.error("AutoFiller: No auth token found. Please login via extension.");
            // alert("Please login via the AutoFiller extension popup first."); // Optional: suppress alert on auto-scan to avoid annoyance
            return;
        }

        fetch('http://localhost:5000/api/matchFields', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ labels })
        })
        .then(response => response.json())
        .then(async matches => {
            const profileValues = matches || {};
            console.log("AutoFiller: Received matches", matches);
            
            if (!matches || typeof matches !== 'object') {
                console.error("AutoFiller: Invalid matches response", matches);
                return;
            }

            // Helper: Autofill Field
            const autofillField = (inputElement, value) => {

                if (!value) return;

                // RADIO BUTTON HANDLER
                if (inputElement.type === "radio") {

                    const radioName = inputElement.name;
                    const savedValue = String(value).toLowerCase().trim();

                    const radios = document.querySelectorAll(`input[type="radio"][name="${radioName}"]`);

                    radios.forEach(radio => {

                        const radioLabel =
                            radio.value?.toLowerCase().trim() ||
                            radio.labels?.[0]?.innerText?.toLowerCase().trim();

                        if (radioLabel === savedValue) {

                            radio.checked = true;

                            radio.dataset.autofilled = "true";

                            radio.dispatchEvent(new Event("change", { bubbles: true }));

                            autofilledValues.set(radio, value);

                            radio.style.outline = "2px solid lightgreen";

                            console.log("AutoFiller: Radio autofilled", value);

                        }

                    });

                    return;
                }

                // CHECKBOX HANDLER
                if (inputElement.type === "checkbox") {

                    const savedValue = String(value).toLowerCase().trim();

                    const checkboxLabel =
                        inputElement.value?.toLowerCase().trim() ||
                        inputElement.labels?.[0]?.innerText?.toLowerCase().trim();

                    if (checkboxLabel === savedValue) {

                        inputElement.checked = true;

                        inputElement.dataset.autofilled = "true";

                        inputElement.dispatchEvent(new Event("change", { bubbles: true }));

                        autofilledValues.set(inputElement, value);

                        inputElement.style.outline = "2px solid lightgreen";

                        console.log("AutoFiller: Checkbox autofilled", value);

                    }

                    return;
                }

                // HANDLE SELECT DROPDOWN
                if (inputElement.tagName === "SELECT") {

                    inputElement.dataset.autofilled = "true";

                    const savedValue = String(value).toLowerCase().trim();

                    let found = false;

                    for (let i = 0; i < inputElement.options.length; i++) {

                        const option = inputElement.options[i];

                        if (!option) continue;

                        const optionText = option.text.toLowerCase().trim();
                        const optionValue = option.value.toLowerCase().trim();

                        if (savedValue === optionText || savedValue === optionValue) {

                            autofillClearingFields.add(inputElement);

                            inputElement.selectedIndex = i;

                            setTimeout(() => {
                                autofillClearingFields.delete(inputElement);
                            }, 100);

                            inputElement.dispatchEvent(new Event("change", { bubbles: true }));

                            autofilledValues.set(inputElement, option.text);

                            inputElement.style.border = "2px solid lightgreen";

                            console.log("AutoFiller: Dropdown autofilled", option.text);

                            found = true;

                            break;
                        }
                    }

                    if (!found) {
                        console.log("AutoFiller: No dropdown match found for", value);
                    }

                    return;
                }

                // HANDLE TEXT INPUTS AND TEXTAREA
                let prototype = window.HTMLInputElement.prototype;

                if (inputElement.tagName === 'TEXTAREA') {
                    prototype = window.HTMLTextAreaElement.prototype;
                }

                const nativeSetter =
                    Object.getOwnPropertyDescriptor(prototype, "value").set;

                nativeSetter.call(inputElement, value);

                inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                inputElement.dispatchEvent(new Event('change', { bubbles: true }));

                inputElement.focus();
                inputElement.blur();

                autofilledValues.set(inputElement, value);

                inputElement.style.border = "2px solid lightgreen";

                console.log("AutoFiller: Field autofilled", value);
            };

            // Helper: Attach Manual Input Listener
            const attachManualInputListener = (inputElement, labelText, token, profileKeys, wasAutofilled) => {

                const normalizedKey = normalizeLabel(labelText);

                if (wasAutofilled) return;

                if (inputElement.dataset.afListenerAttached) {
                    return;
                }

                inputElement.dataset.afListenerAttached = "true";

                inputElement.addEventListener('blur', async () => {

                    const newValue = inputElement.value.trim();

                    if (!newValue) return;

                    const profileValue =
                        profileValues[normalizedKey] ||
                        profileValues[labelText] ||
                        null;

                    // Only trigger if value is new or different
                    if (profileValue && profileValue === newValue) {
                        return;
                    }

                    if (saveLock.has(inputElement)) return;

                    saveLock.add(inputElement);

                    const confirmed = confirm(
                        `Do you want to save "${labelText}" to your profile?`
                    );

                    if (!confirmed) {
                        saveLock.delete(inputElement);
                        return;
                    }

                    try {

                        await fetch('http://localhost:5000/api/profiles/saveField', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                            },
                            body: JSON.stringify({
                                key: normalizedKey,
                                value: newValue
                            })
                        });

                        autofilledValues.set(inputElement, newValue);

                        console.log("AutoFiller: New field learned:", normalizedKey);

                    } catch (e) {
                        console.error(e);
                    } finally {
                        // CRITICAL FIX: always release lock
                        saveLock.delete(inputElement);
                    }

                });

            };

            // Helper: Mapping Panel
            const showMappingPanel = (labelText, token) => {
                return new Promise((resolve) => {
                    // Check if panel already exists
                    if (document.getElementById(`af-panel-${labelText.replace(/[\s\W]/g, '-')}`)) {
                         return; // Avoid duplicates
                    }

                    const panel = document.createElement('div');
                    panel.id = `af-panel-${labelText.replace(/[\s\W]/g, '-')}`;
                    Object.assign(panel.style, {
                        position: 'fixed', top: '20px', right: '20px', backgroundColor: 'white',
                        padding: '15px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', zIndex: '999999',
                        border: '1px solid #ccc', borderRadius: '8px', fontFamily: 'Arial, sans-serif', width: '300px'
                    });

                    panel.innerHTML = `
                        <h4 style="margin: 0 0 10px 0">Map Field: ${labelText}</h4>
                        <select id="af-key-select" style="width: 100%; margin-bottom: 10px; padding: 5px;">
                            <option>Loading keys...</option>
                        </select>
                        <div style="display: flex; justify-content: flex-end; gap: 10px;">
                            <button id="af-skip-btn" style="padding: 5px 10px; cursor: pointer;">Skip</button>
                            <button id="af-save-btn" style="padding: 5px 10px; cursor: pointer; background-color: #4CAF50; color: white; border: none; border-radius: 4px;">Save Mapping</button>
                        </div>
                    `;
                    document.body.appendChild(panel);

                    // Fetch keys
                    fetch('http://localhost:5000/api/profiles/keys', {
                        headers: { 'Authorization': `Bearer ${token}` }
                    })
                    .then(res => res.json())
                    .then(keys => {
                        const select = panel.querySelector('#af-key-select');

                        if (!keys || keys.length === 0) {
                            select.innerHTML = '<option>No active profile. Activate profile first.</option>';
                            panel.querySelector('#af-save-btn').disabled = true;
                            return;
                        }

                        select.innerHTML = '<option value="">Select Profile Key</option>';

                        keys.forEach(k => {
                            const opt = document.createElement('option');
                            opt.value = k;
                            opt.text = k;
                            select.appendChild(opt);
                        });
                    })
                    .catch(err => {
                        console.error("AutoFiller: Failed to fetch profile keys", err);
                    });

                    // Handlers
                    panel.querySelector('#af-skip-btn').onclick = () => {
                        document.body.removeChild(panel);
                        resolve(null);
                    };

                    panel.querySelector('#af-save-btn').onclick = () => {
                        const key = panel.querySelector('#af-key-select').value;
                        if (key) {
                            document.body.removeChild(panel);
                            resolve(key);
                        } else {
                            alert('Please select a key');
                        }
                    };
                });
            };

            // Process Fields
            const startProcessing = async () => {
                // Fetch profile keys
                let profileKeys = new Set();
                try {
                    const keysRes = await fetch('http://localhost:5000/api/profiles/keys', {
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    });

                    if (keysRes.ok) {
                        const keys = await keysRes.json();
                        profileKeys = new Set(keys.map(k => normalizeLabel(k)));
                    }
                } catch (err) {
                    console.error("Failed to load profile keys", err);
                }

                // Fetch existing mappings first
                let existingLabels = new Set();
                try {
                    const mapRes = await fetch('http://localhost:5000/api/mappings', {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (mapRes.ok) {
                        const mappings = await mapRes.json();
                        existingLabels = new Set(
                            mappings.map(m => normalizeLabel(m.form_label))
                        );
                    }
                } catch (e) { console.error(e); }

                const skippedLabels = new Set();

                /* =========================
                GOOGLE FORMS RADIO SUPPORT
                ========================= */

                const googleRadios = document.querySelectorAll('[role="radio"]');

                googleRadios.forEach(radio => {

                    if (radio.dataset.afRadioAttached === "true") return;

                    radio.dataset.afRadioAttached = "true";

                    const container = radio.closest('[role="listitem"]');

                    if (!container) return;

                    const labelElement =
                        container.querySelector('[role="heading"], .M7eMe, .HoXoMd');

                    if (!labelElement) return;

                    const originalLabel = labelElement.innerText.trim();

                    const normalizedLabel = normalizeLabel(originalLabel);

                    const radioValue =
                        radio.getAttribute("data-value") ||
                        radio.innerText.trim();



                    /* AUTOFILL */

                    const savedValue = profileValues[normalizedLabel];

                    if (
                        savedValue &&
                        savedValue.toLowerCase() === radioValue.toLowerCase()
                    ) {

                        autofillClearingFields.add(radio);

                        radio.click();

                        setTimeout(() => {
                            autofillClearingFields.delete(radio);
                        }, 200);

                        console.log("AutoFiller: Google radio autofilled", radioValue);

                    }



                    /* SAVE LISTENER */

                    radio.addEventListener("click", async () => {

                        if (autofillClearingFields.has(radio)) return;

                        if (saveLock.has(radio)) return;

                        saveLock.add(radio);

                        const confirmed = confirm(
                            `Save "${originalLabel}" = "${radioValue}" to profile?`
                        );

                        if (!confirmed) {

                            saveLock.delete(radio);

                            return;
                        }

                        try {

                            await fetch(
                                "http://localhost:5000/api/profiles/saveField",
                                {
                                    method: "POST",
                                    headers: {
                                        "Content-Type": "application/json",
                                        "Authorization": `Bearer ${token}`
                                    },
                                    body: JSON.stringify({
                                        key: normalizedLabel,
                                        value: radioValue
                                    })
                                }
                            );

                            console.log("AutoFiller: Google radio saved", radioValue);

                        }
                        catch(err) {

                            console.error(err);

                        }

                        saveLock.delete(radio);

                    });

                });

                /* =========================
                END GOOGLE RADIO SUPPORT
                ========================= */

                /* =========================
                GOOGLE FORMS CHECKBOX SUPPORT
                ========================= */

                const googleCheckboxes = document.querySelectorAll('[role="checkbox"]');

                googleCheckboxes.forEach(box => {

                    if (box.dataset.afCheckboxAttached === "true") return;

                    box.dataset.afCheckboxAttached = "true";

                    const container = box.closest('[role="listitem"]');
                    if (!container) return;

                    const labelElement =
                        container.querySelector('[role="heading"], .M7eMe, .HoXoMd');

                    if (!labelElement) return;

                    const originalLabel = labelElement.innerText.trim();
                    const normalizedLabel = normalizeLabel(originalLabel);

                    const checkboxValue =
                        box.getAttribute("data-answer-value") ||
                        box.innerText.trim();

                    if (!checkboxValue) return;

                    /* AUTOFILL */

                    const savedValue = profileValues[normalizedLabel];

                    if (
                        savedValue &&
                        savedValue.toLowerCase() === checkboxValue.toLowerCase()
                    ) {

                        autofillClearingFields.add(box);

                        box.click();

                        setTimeout(() => {
                            autofillClearingFields.delete(box);
                        }, 200);

                        console.log("AutoFiller: Google checkbox autofilled", checkboxValue);
                    }

                    /* SAVE LISTENER */

                    box.addEventListener("click", async () => {

                        if (autofillClearingFields.has(box)) return;

                        if (saveLock.has(box)) return;

                        saveLock.add(box);

                        const confirmed = confirm(
                            `Save "${originalLabel}" = "${checkboxValue}" to profile?`
                        );

                        if (!confirmed) {
                            saveLock.delete(box);
                            return;
                        }

                        try {

                            const tokenData =
                                await new Promise(r => chrome.storage.local.get(['token'], r));

                            const activeToken = tokenData.token;

                            await fetch(
                                "http://localhost:5000/api/profiles/saveField",
                                {
                                    method: "POST",
                                    headers: {
                                        "Content-Type": "application/json",
                                        "Authorization": `Bearer ${activeToken}`
                                    },
                                    body: JSON.stringify({
                                        key: normalizedLabel,
                                        value: checkboxValue
                                    })
                                }
                            );

                            console.log("AutoFiller: Google checkbox saved", checkboxValue);

                        }
                        catch(err) {

                            console.error(err);

                        }

                        saveLock.delete(box);

                    });

                });

                /* =========================
                END GOOGLE CHECKBOX SUPPORT
                ========================= */

                /* =========================
                UNIVERSAL RADIO SUPPORT
                ========================= */

                const allRadios = document.querySelectorAll('input[type="radio"]');

                allRadios.forEach(radio => {

                    if (radio.dataset.afUniversalRadioAttached === "true") return;

                    radio.dataset.afUniversalRadioAttached = "true";

                    const name = radio.name;

                    if (!name) return;

                    // Find label text for group
                    let labelText = "";

                    const labelElement =
                        radio.closest("label") ||
                        document.querySelector(`label[for="${radio.id}"]`);

                    if (labelElement && labelElement.innerText.trim()) {
                        labelText = labelElement.innerText.trim();
                    }
                    else if (radio.name) {
                        labelText = radio.name;
                    }

                    const normalizedLabel = normalizeLabel(labelText);

                    const radioValue =
                        radio.value ||
                        labelElement?.innerText ||
                        radio.nextSibling?.textContent ||
                        "";

                    if (!radioValue) return;



                    /* AUTOFILL */

                    const savedValue = profileValues[normalizedLabel];

                    if (
                        savedValue &&
                        savedValue.toLowerCase() === radioValue.toLowerCase()
                    ) {

                        autofillClearingFields.add(radio);

                        radio.checked = true;

                        radio.dataset.autofilled = "true";

                        radio.dispatchEvent(new Event("change", { bubbles: true }));

                        setTimeout(() => {
                            autofillClearingFields.delete(radio);
                        }, 200);

                        console.log("AutoFiller: Radio autofilled", radioValue);
                    }



                    /* SAVE LISTENER */

                    radio.addEventListener("change", async () => {

                        if (radio.dataset.autofilled === "true") {
                            delete radio.dataset.autofilled;
                            return;
                        }

                        if (autofillClearingFields.has(radio)) return;

                        if (!radio.checked) return;

                        if (saveLock.has(radio)) return;

                        saveLock.add(radio);

                        const confirmed = confirm(
                            `Save "${labelText}" = "${radioValue}" to profile?`
                        );

                        if (!confirmed) {

                            saveLock.delete(radio);

                            return;
                        }

                        try {

                            const tokenData =
                                await new Promise(r => chrome.storage.local.get(['token'], r));

                            const activeToken = tokenData.token;

                            await fetch(
                                "http://localhost:5000/api/profiles/saveField",
                                {
                                    method: "POST",
                                    headers: {
                                        "Content-Type": "application/json",
                                        "Authorization": `Bearer ${activeToken}`
                                    },
                                    body: JSON.stringify({
                                        key: normalizedLabel,
                                        value: radioValue
                                    })
                                }
                            );

                            console.log("AutoFiller: Radio saved", radioValue);

                        }
                        catch(err) {

                            console.error(err);

                        }

                        saveLock.delete(radio);

                    });

                });

                /* =========================
                END UNIVERSAL RADIO SUPPORT
                ========================= */

                /* =========================
                UNIVERSAL CHECKBOX SUPPORT
                ========================= */

                const allCheckboxes = document.querySelectorAll('input[type="checkbox"]');

                allCheckboxes.forEach(checkbox => {

                    if (checkbox.dataset.afUniversalCheckboxAttached === "true") return;

                    checkbox.dataset.afUniversalCheckboxAttached = "true";



                    // FIND GROUP LABEL
                    let labelText = "";

                    const labelElement =
                        checkbox.closest("label") ||
                        document.querySelector(`label[for="${checkbox.id}"]`);

                    if (labelElement && labelElement.innerText.trim()) {

                        labelText = labelElement.innerText.trim();

                    }
                    else if (checkbox.name) {

                        labelText = checkbox.name;

                    }
                    else {

                        labelText = "checkbox_field";

                    }



                    const normalizedLabel = normalizeLabel(labelText);



                    const checkboxValue =
                        checkbox.value ||
                        labelElement?.innerText ||
                        checkbox.nextSibling?.textContent ||
                        "checked";



                    /* =================
                    AUTOFILL
                    ================= */

                    const savedValue = profileValues[normalizedLabel];

                    if (
                        savedValue &&
                        savedValue.toLowerCase() === checkboxValue.toLowerCase()
                    ) {

                        autofillClearingFields.add(checkbox);

                        checkbox.checked = true;

                        checkbox.dataset.autofilled = "true";

                        checkbox.dispatchEvent(new Event("change", { bubbles: true }));

                        setTimeout(() => {
                            autofillClearingFields.delete(checkbox);
                        }, 200);

                        console.log("AutoFiller: Checkbox autofilled", checkboxValue);
                    }



                    /* =================
                    SAVE LISTENER
                    ================= */

                    checkbox.addEventListener("change", async () => {

                        if (checkbox.dataset.autofilled === "true") {
                            delete checkbox.dataset.autofilled;
                            return;
                        }

                        if (autofillClearingFields.has(checkbox)) return;

                        if (!checkbox.checked) return;

                        if (saveLock.has(checkbox)) return;

                        saveLock.add(checkbox);

                        const confirmed = confirm(
                            `Save "${labelText}" = "${checkboxValue}" to profile?`
                        );

                        if (!confirmed) {

                            saveLock.delete(checkbox);

                            return;

                        }

                        try {

                            const tokenData =
                                await new Promise(r => chrome.storage.local.get(['token'], r));

                            const activeToken = tokenData.token;

                            await fetch(
                                "http://localhost:5000/api/profiles/saveField",
                                {
                                    method: "POST",
                                    headers: {
                                        "Content-Type": "application/json",
                                        "Authorization": `Bearer ${activeToken}`
                                    },
                                    body: JSON.stringify({
                                        key: normalizedLabel,
                                        value: checkboxValue
                                    })
                                }
                            );

                            console.log("AutoFiller: Checkbox saved", checkboxValue);

                        }
                        catch(err) {

                            console.error(err);

                        }

                        saveLock.delete(checkbox);

                    });

                });

                /* =========================
                END UNIVERSAL CHECKBOX SUPPORT
                ========================= */

                // Step 1: Clear field first
                const clearField = (inputElement) => {

                    if (!inputElement) return;

                    if (inputElement.tagName === "SELECT") {

                        autofillClearingFields.add(inputElement);

                        inputElement.selectedIndex = 0;

                        setTimeout(() => {
                            autofillClearingFields.delete(inputElement);
                        }, 100);

                        return;
                    }

                    const tag = inputElement.tagName;

                    // SELECT dropdown safe clear
                    if (tag === "SELECT") {

                        inputElement.selectedIndex = -1;

                        inputElement.dispatchEvent(new Event("change", { bubbles: true }));

                        return;
                    }

                    // contenteditable safe clear
                    if (inputElement.isContentEditable) {

                        inputElement.innerHTML = "";

                        inputElement.dispatchEvent(new Event("input", { bubbles: true }));

                        return;
                    }

                    // INPUT or TEXTAREA safe clear
                    if (tag === "INPUT" || tag === "TEXTAREA") {

                        inputElement.value = "";

                        inputElement.dispatchEvent(new Event("input", { bubbles: true }));

                        inputElement.dispatchEvent(new Event("change", { bubbles: true }));

                        return;
                    }

                };

                for (const field of formFields) {
                    const { originalLabel, normalizedLabel, inputElement } = field;
                    
                    // Always clear first
                    clearField(inputElement);

                    // Attach manual input listener for learning
                    const wasAutofilled = !!matches[normalizedLabel];
                    attachManualInputListener(
                        inputElement, 
                        originalLabel, 
                        token, 
                        profileKeys, 
                        wasAutofilled
                    );

                    if (inputElement.tagName === "SELECT") {

                        if (inputElement.dataset.afDropdownListenerAttached === "true") {
                            return;
                        }

                        inputElement.dataset.afDropdownListenerAttached = "true";

                        inputElement.addEventListener("change", async () => {

                            if (autofillClearingFields.has(inputElement)) {
                                return;
                            }

                            if (inputElement.dataset.autofilled === "true") {
                                delete inputElement.dataset.autofilled;
                                return;
                            }

                            const selectedText =
                                inputElement.options[inputElement.selectedIndex]?.text;

                            if (!selectedText) return;

                            if (saveLock.has(inputElement)) return;

                            saveLock.add(inputElement);

                            const confirmSave = confirm(
                                `Field "${originalLabel}" changed.\n\nSave new value to profile?`
                            );

                            if (!confirmSave) {
                                saveLock.delete(inputElement);
                                return;
                            }

                            try {

                                await fetch("http://localhost:5000/api/profiles/saveField", {
                                    method: "POST",
                                    headers: {
                                        "Content-Type": "application/json",
                                        "Authorization": `Bearer ${token}`
                                    },
                                    body: JSON.stringify({
                                        key: normalizeLabel(originalLabel),
                                        value: selectedText
                                    })
                                });

                                autofilledValues.set(inputElement, selectedText);

                                console.log("AutoFiller: Dropdown saved", selectedText);

                            } catch (err) {

                                console.error(err);

                            }

                            saveLock.delete(inputElement);

                        });
                    }

                    if (inputElement.type === "radio" || inputElement.type === "checkbox") {

                        if (!inputElement.dataset.afBinaryListener) {

                            inputElement.dataset.afBinaryListener = "true";

                            inputElement.addEventListener("change", async () => {

                                if (inputElement.dataset.autofilled === "true") {
                                    delete inputElement.dataset.autofilled;
                                    return;
                                }

                                if (!inputElement.checked) return;

                                const selectedValue =
                                    inputElement.value ||
                                    inputElement.labels?.[0]?.innerText ||
                                    "";

                                if (!selectedValue) return;

                                if (saveLock.has(inputElement)) return;

                                saveLock.add(inputElement);

                                const confirmed = confirm(
                                    `Save "${originalLabel}" = "${selectedValue}" to profile?`
                                );

                                if (!confirmed) {
                                    saveLock.delete(inputElement);
                                    return;
                                }

                                try {

                                    const tokenData = await new Promise(r => chrome.storage.local.get(['token'], r));
                                    const activeToken = tokenData.token;

                                    await fetch("http://localhost:5000/api/profiles/saveField", {
                                        method: "POST",
                                        headers: {
                                            "Content-Type": "application/json",
                                            "Authorization": `Bearer ${activeToken}`
                                        },
                                        body: JSON.stringify({
                                            key: normalizeLabel(originalLabel),
                                            value: selectedValue
                                        })
                                    });

                                    autofilledValues.set(inputElement, selectedValue);

                                    console.log("AutoFiller: Radio/Checkbox saved", selectedValue);

                                } catch (err) {

                                    console.error(err);

                                }

                                saveLock.delete(inputElement);

                            });
                        }
                    }

                    console.log("Checking field:", originalLabel);

                    if (matches[normalizedLabel]) {
                        console.log("Match found for:", normalizedLabel);
                        autofillField(inputElement, matches[normalizedLabel]);

                        inputElement.addEventListener("input", () => {
                            userEditedFields.add(inputElement);
                        });

                        inputElement.addEventListener("blur", async () => {

                            if (!userEditedFields.has(inputElement)) return;

                            const originalValue = autofilledValues.get(inputElement);
                            const newValue = inputElement.value.trim();

                            if (!originalValue) return;
                            if (newValue === originalValue) return;

                            console.log("AutoFiller: User updated field");

                            const confirmed = confirm(
                                `Field "${originalLabel}" changed.\n\nSave new value to profile?`
                            );

                            if (!confirmed) return;

                            chrome.storage.local.get(['token'], async (result) => {

                                const token = result.token;

                                await fetch("http://localhost:5000/api/profiles/saveField", {
                                    method: "POST",
                                    headers: {
                                        "Content-Type": "application/json",
                                        "Authorization": `Bearer ${token}`
                                    },
                                    body: JSON.stringify({
                                        key: originalLabel.toLowerCase().replace(/\s+/g, "_"),
                                        value: newValue
                                    })
                                });

                                autofilledValues.set(inputElement, newValue);

                                console.log("AutoFiller: Profile updated");
                            });

                        });

                    } else {
                        console.log("No valid match for:", normalizedLabel);

                        if (skippedLabels.has(originalLabel)) continue;

                        // Always allow mapping panel if no valid match exists
                        const userKey = await showMappingPanel(originalLabel, token);

                        if (userKey) {
                            console.log("Saving mapping:", originalLabel, "->", userKey);

                            try {
                                await fetch('http://localhost:5000/api/mappings', {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': `Bearer ${token}`
                                    },
                                    body: JSON.stringify({
                                        form_label: originalLabel,
                                        mapped_key: userKey
                                    })
                                });

                                const matchRes = await fetch('http://localhost:5000/api/matchFields', {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': `Bearer ${token}`
                                    },
                                    body: JSON.stringify({ labels: [normalizedLabel] })
                                });

                                const newMatches = await matchRes.json();

                                if (newMatches[normalizedLabel]) {
                                    autofillField(inputElement, newMatches[normalizedLabel]);
                                }

                            } catch (e) {
                                console.error("Error saving mapping:", e);
                            }

                        } else {
                            console.log("User skipped mapping for:", originalLabel);
                            skippedLabels.add(originalLabel);
                        }
                    }
                }
            };

            startProcessing();
        })
        .catch(error => {
            console.error("AutoFiller Error:", error);
        });
    });
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "scan") {

    autofillAlreadyExecuted = false;

    runAutoFill();
  }
});

window.addEventListener("load", () => {
  setTimeout(() => {
    console.log("AutoFiller: Auto-scanning form on load");
    runAutoFill();
  }, 1500);
});

const observer = new MutationObserver(() => {
  const formExists = document.querySelector('input, textarea');
  if (formExists) {
    console.log("AutoFiller: Form detected via observer");
    runAutoFill();
    observer.disconnect();
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

setTimeout(() => {
    observer.disconnect();
}, 3000);
