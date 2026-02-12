chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "scan") {
    console.log("AutoFiller: Scanning form...");

    // 1. Collect all headings (Questions) inside list items
    const headings = Array.from(document.querySelectorAll('div[role="listitem"] div[role="heading"]'));
    
    // 2. Collect all inputs (Short answer, Long answer, etc.)
    const inputs = Array.from(document.querySelectorAll('input[type="text"], input[type="email"], textarea, div[contenteditable="true"]'))
        .filter(el => {
            return el.offsetParent !== null; 
        });

    console.log(`Found ${headings.length} headings and ${inputs.length} inputs.`);

    // 3. Pair them by index directly
    const count = Math.min(headings.length, inputs.length);
    const formFields = [];
    const labels = [];

    for (let i = 0; i < count; i++) {
        const labelText = headings[i].innerText.trim();
        const inputElement = inputs[i];
        formFields.push({ labelText, inputElement });
        labels.push(labelText);
        console.log(`Mapped: "${labelText}" ->`, inputElement);
    }

    // 4. Send labels to backend to get values
    // Retrieve token first
    chrome.storage.local.get(['token'], (result) => {
        const token = result.token;
        if (!token) {
            console.error("AutoFiller: No auth token found. Please login via extension.");
            alert("Please login via the AutoFiller extension popup first.");
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
        console.log("AutoFiller: Received matches", matches);
        
        if (!matches || typeof matches !== 'object') {
            console.error("AutoFiller: Invalid matches response", matches);
            return;
        }

        const promptedLabels = new Set();
        const skippedLabels = new Set();

        // Fetch existing mappings to avoid re-prompting
        let existingMappings = [];
        try {
            const mapRes = await fetch('http://localhost:5000/api/mappings', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (mapRes.ok) {
                existingMappings = await mapRes.json();
            }
        } catch (e) {
            console.error("AutoFiller: Error fetching mappings", e);
        }
        
        const existingLabels = new Set(existingMappings.map(m => m.form_label));

        // 5. Fill fields
        for (const field of formFields) {
            const { labelText, inputElement } = field;
            if (matches[labelText]) {
                const value = matches[labelText];
                
                // Handle different input types
                if (inputElement.getAttribute('contenteditable') === 'true') {
                    inputElement.innerHTML = value;
                } else {
                    // Use native prototype setter to bypass React/event tracking overrides
                    let prototype = window.HTMLInputElement.prototype;
                    if (inputElement.tagName === 'TEXTAREA') {
                        prototype = window.HTMLTextAreaElement.prototype;
                    }
                    
                    const nativeSetter = Object.getOwnPropertyDescriptor(prototype, "value").set;
                    if (nativeSetter) {
                        nativeSetter.call(inputElement, value);
                    } else {
                        inputElement.value = value;
                    }
                }

                // Dispatch events to ensure Google Forms detects the change
                inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                inputElement.dispatchEvent(new Event('change', { bubbles: true }));
                inputElement.dispatchEvent(new Event('blur', { bubbles: true }));

                // Visual Highlight
                inputElement.style.border = "2px solid lightgreen";
            } else {
                if (promptedLabels.has(labelText) || skippedLabels.has(labelText)) continue;
                
                // Check if mapping exists in backend
                if (existingLabels.has(labelText)) {
                    console.log(`Skipping prompt for "${labelText}" (already mapped in backend)`);
                    continue;
                }
                
                console.log(`No match for: "${labelText}"`);
                promptedLabels.add(labelText);

                // Prompt user to learn mapping
                const rawUserKey = prompt(`AutoFiller does not know this field: "${labelText}".\nEnter the profile key to use (e.g., 'mobile_number') or leave empty to skip:`);
                
                const userKey = rawUserKey ? rawUserKey.trim() : "";

                if (!userKey) {
                    skippedLabels.add(labelText);
                    continue;
                }

                    fetch('http://localhost:5000/api/mappings', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({
                            form_label: labelText,
                            mapped_key: userKey
                        })
                    })
                    .then(res => {
                        if (res.ok) {
                            existingLabels.add(labelText);
                            // Immediately fetch value using matchFields
                            fetch('http://localhost:5000/api/matchFields', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${token}`
                                },
                                body: JSON.stringify({ labels: [labelText] })
                            })
                            .then(mRes => mRes.json())
                            .then(newMatches => {
                                if (newMatches && newMatches[labelText]) {
                                    const newValue = newMatches[labelText];
                                    
                                    // Autofill logic
                                    if (inputElement.getAttribute('contenteditable') === 'true') {
                                        inputElement.innerHTML = newValue;
                                    } else {
                                        let prototype = window.HTMLInputElement.prototype;
                                        if (inputElement.tagName === 'TEXTAREA') prototype = window.HTMLTextAreaElement.prototype;
                                        const nativeSetter = Object.getOwnPropertyDescriptor(prototype, "value").set;
                                        if (nativeSetter) nativeSetter.call(inputElement, newValue);
                                        else inputElement.value = newValue;
                                    }
                                    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                                    inputElement.dispatchEvent(new Event('change', { bubbles: true }));
                                    inputElement.dispatchEvent(new Event('blur', { bubbles: true }));
                                    inputElement.style.border = "2px solid lightgreen";
                                }
                                alert(`Mapping saved for "${labelText}". Autofilled.`);
                            });
                        } else {
                            console.error("AutoFiller: Failed to save mapping");
                        }
                    })
                    .catch(err => console.error("AutoFiller Error saving mapping:", err));

            }
        }
    })
    .catch(error => {
        console.error("AutoFiller Error:", error);
        });
    });
  }
});
