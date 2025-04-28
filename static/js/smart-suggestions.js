/**
 * PeerLearn Smart Suggestions
 * 
 * Adds intelligent field suggestions with autocorrect for educational fields
 * Uses advanced techniques for providing context-relevant suggestions
 */

// Educational domains for suggestions
const EDUCATIONAL_DOMAINS = [
    // Computer Science
    'Python', 'JavaScript', 'Java', 'C++', 'C#', 'PHP', 'Ruby', 'Swift', 'Kotlin', 'Go',
    'Web Development', 'Mobile Development', 'Data Science', 'Machine Learning', 'Artificial Intelligence',
    'DevOps', 'Cloud Computing', 'Cybersecurity', 'Blockchain', 'Database Management',
    'SQL', 'NoSQL', 'React', 'Angular', 'Vue.js', 'Node.js', 'Django', 'Flask', 'Spring Boot',
    'AWS', 'Azure', 'Google Cloud', 'Docker', 'Kubernetes', 'Git', 'GitHub',
    'Front-end Development', 'Back-end Development', 'Full-stack Development',
    
    // Business & Management
    'Entrepreneurship', 'Marketing', 'Finance', 'Accounting', 'Economics', 'Management',
    'Business Strategy', 'Human Resources', 'Operations Management', 'Supply Chain Management',
    'Project Management', 'Product Management', 'Business Analytics', 'Digital Marketing',
    'Content Marketing', 'SEO', 'SEM', 'Social Media Marketing',
    
    // Design
    'Graphic Design', 'UX Design', 'UI Design', 'Web Design', 'Product Design',
    'Illustration', 'Branding', 'Typography', 'Animation', '3D Modeling',
    'Photoshop', 'Illustrator', 'Figma', 'Sketch', 'InDesign', 'After Effects',
    
    // Mathematics
    'Calculus', 'Linear Algebra', 'Statistics', 'Probability', 'Discrete Mathematics',
    'Number Theory', 'Geometry', 'Trigonometry', 'Algebra', 'Mathematical Analysis',
    
    // Science
    'Physics', 'Chemistry', 'Biology', 'Astronomy', 'Earth Science',
    'Organic Chemistry', 'Inorganic Chemistry', 'Mechanics', 'Thermodynamics',
    'Quantum Mechanics', 'Molecular Biology', 'Genetics', 'Ecology',
    
    // Languages
    'English', 'Spanish', 'French', 'German', 'Chinese', 'Japanese', 'Italian',
    'Russian', 'Arabic', 'Portuguese', 'Hindi', 'Korean', 'Turkish',
    
    // Soft Skills
    'Communication', 'Leadership', 'Critical Thinking', 'Problem Solving',
    'Time Management', 'Team Work', 'Adaptability', 'Creativity', 'Emotional Intelligence',
    'Networking', 'Public Speaking', 'Negotiation', 'Conflict Resolution'
];

// Career paths for suggestions
const CAREER_PATHS = [
    'Software Engineer', 'Data Scientist', 'Web Developer', 'Mobile App Developer',
    'UX/UI Designer', 'Product Manager', 'Project Manager', 'Digital Marketer',
    'Business Analyst', 'Financial Analyst', 'Accountant', 'Marketing Manager',
    'Sales Manager', 'Human Resources Manager', 'Operations Manager',
    'Content Creator', 'Graphic Designer', 'Video Editor', 'Teacher', 'Professor',
    'Research Scientist', 'Medical Doctor', 'Nurse', 'Pharmacist', 'Lawyer',
    'Architect', 'Civil Engineer', 'Mechanical Engineer', 'Electrical Engineer',
    'Entrepreneur', 'Consultant', 'Cyber Security Specialist', 'Cloud Architect',
    'AI Researcher', 'Blockchain Developer', 'DevOps Engineer', 'Technical Writer'
];

/**
 * Initialize smart suggestions for all applicable input fields
 */
function initSmartSuggestions() {
    // Add suggestions to search fields
    addSuggestionsToSearchFields();
    
    // Add suggestions to registration/profile form fields
    addSuggestionsToProfileFields();
    
    // Add suggestions to session creation fields
    addSuggestionsToSessionFields();
}

/**
 * Add smart suggestions to search fields
 */
function addSuggestionsToSearchFields() {
    // Find all search input fields
    const searchInputs = document.querySelectorAll('input[name="q"]');
    
    searchInputs.forEach(input => {
        // Create suggestion container
        const suggestionContainer = createSuggestionContainer(input);
        
        // Add event listeners
        input.addEventListener('input', debounce(function() {
            const query = this.value.trim();
            if (query.length < 2) {
                clearSuggestions(suggestionContainer);
                return;
            }
            
            // Get suggestions
            const suggestions = getSearchSuggestions(query);
            displaySuggestions(suggestionContainer, suggestions, input);
            
            // Show auto-correction if needed
            showAutoCorrection(input, query);
        }, 300));
        
        // Handle focus events
        handleInputFocusEvents(input, suggestionContainer);
    });
}

/**
 * Add smart suggestions to profile fields
 */
function addSuggestionsToProfileFields() {
    // Career goals field (for learners)
    const careerGoalsInput = document.querySelector('textarea[id$="career_goals"]');
    if (careerGoalsInput) {
        const suggestionContainer = createSuggestionContainer(careerGoalsInput);
        
        careerGoalsInput.addEventListener('input', debounce(function() {
            const query = this.value.trim();
            if (query.length < 2) {
                clearSuggestions(suggestionContainer);
                return;
            }
            
            // Get career path suggestions
            const suggestions = getCareerSuggestions(query);
            displaySuggestions(suggestionContainer, suggestions, careerGoalsInput);
            
            // Show auto-correction if needed
            showAutoCorrection(careerGoalsInput, query);
        }, 300));
        
        // Handle focus events
        handleInputFocusEvents(careerGoalsInput, suggestionContainer);
    }
    
    // Expertise field (for mentors)
    const expertiseInput = document.querySelector('textarea[id$="expertise"], input[id$="expertise"]');
    if (expertiseInput) {
        const suggestionContainer = createSuggestionContainer(expertiseInput);
        
        expertiseInput.addEventListener('input', debounce(function() {
            const query = this.value.trim();
            if (query.length < 2) {
                clearSuggestions(suggestionContainer);
                return;
            }
            
            // Get expertise suggestions
            const suggestions = getExpertiseSuggestions(query);
            displaySuggestions(suggestionContainer, suggestions, expertiseInput);
            
            // Show auto-correction if needed
            showAutoCorrection(expertiseInput, query);
        }, 300));
        
        // Handle focus events
        handleInputFocusEvents(expertiseInput, suggestionContainer);
    }
}

/**
 * Add smart suggestions to session creation fields
 */
function addSuggestionsToSessionFields() {
    // Session title field
    const titleInput = document.querySelector('input[id$="title"]');
    if (titleInput) {
        const suggestionContainer = createSuggestionContainer(titleInput);
        
        titleInput.addEventListener('input', debounce(function() {
            const query = this.value.trim();
            if (query.length < 3) {
                clearSuggestions(suggestionContainer);
                return;
            }
            
            // Get title suggestions
            const suggestions = getSessionTitleSuggestions(query);
            displaySuggestions(suggestionContainer, suggestions, titleInput);
            
            // Show auto-correction if needed
            showAutoCorrection(titleInput, query);
        }, 300));
        
        // Handle focus events
        handleInputFocusEvents(titleInput, suggestionContainer);
    }
    
    // Session tags field
    const tagsInput = document.querySelector('input[id$="tags"]');
    if (tagsInput) {
        const suggestionContainer = createSuggestionContainer(tagsInput);
        
        tagsInput.addEventListener('input', debounce(function() {
            const query = this.value.trim();
            if (query.length < 2) {
                clearSuggestions(suggestionContainer);
                return;
            }
            
            // Get last tag being typed
            const tags = query.split(',');
            const currentTag = tags[tags.length - 1].trim();
            
            if (currentTag.length < 2) {
                clearSuggestions(suggestionContainer);
                return;
            }
            
            // Get tag suggestions
            const suggestions = getTagSuggestions(currentTag);
            
            // Custom selection handler for tags
            displaySuggestions(suggestionContainer, suggestions, tagsInput, (input, suggestion) => {
                const existingTags = input.value.split(',').slice(0, -1).map(tag => tag.trim());
                existingTags.push(suggestion);
                input.value = existingTags.join(', ') + ', ';
            });
            
            // Show auto-correction if needed
            showAutoCorrection(tagsInput, currentTag);
        }, 300));
        
        // Handle focus events
        handleInputFocusEvents(tagsInput, suggestionContainer);
    }
}

/**
 * Create a suggestion container for an input
 */
function createSuggestionContainer(inputElement) {
    const container = document.createElement('div');
    container.className = 'suggestion-container absolute z-50 w-full bg-white border border-gray-300 rounded-md shadow-lg mt-1 hidden overflow-hidden';
    container.style.maxHeight = '200px';
    container.style.overflowY = 'auto';
    
    // Insert after input, within parent container
    inputElement.parentElement.style.position = 'relative';
    inputElement.parentElement.appendChild(container);
    
    return container;
}

/**
 * Get suggestions based on search query
 */
function getSearchSuggestions(query) {
    // For search, include both educational domains and career paths
    const allItems = [...EDUCATIONAL_DOMAINS, ...CAREER_PATHS];
    return filterSuggestions(allItems, query);
}

/**
 * Get suggestions based on career goals query
 */
function getCareerSuggestions(query) {
    return filterSuggestions(CAREER_PATHS, query);
}

/**
 * Get suggestions based on expertise query
 */
function getExpertiseSuggestions(query) {
    return filterSuggestions(EDUCATIONAL_DOMAINS, query);
}

/**
 * Get suggestions for session titles
 */
function getSessionTitleSuggestions(query) {
    // Start with basic educational domain matches
    const domainMatches = filterSuggestions(EDUCATIONAL_DOMAINS, query);
    
    // Create title suggestions from matches
    const titleSuggestions = [];
    
    // Add common prefixes to domain matches
    const titlePrefixes = [
        'Introduction to', 
        'Advanced', 
        'Mastering', 
        'Learn', 
        'Fundamentals of', 
        'Beginner\'s Guide to',
        'Complete Course on',
        'Professional',
        'Practical'
    ];
    
    domainMatches.forEach(domain => {
        titlePrefixes.forEach(prefix => {
            titleSuggestions.push(`${prefix} ${domain}`);
        });
    });
    
    // Filter by similarity to the user's query
    return titleSuggestions
        .filter(title => calculateSimilarity(title.toLowerCase(), query.toLowerCase()) > 0.3)
        .slice(0, 5);
}

/**
 * Get suggestions for session tags
 */
function getTagSuggestions(query) {
    return filterSuggestions(EDUCATIONAL_DOMAINS, query);
}

/**
 * Filter array items based on query with fuzzy matching
 */
function filterSuggestions(items, query) {
    query = query.toLowerCase();
    
    // Create scored results
    const scoredResults = items.map(item => ({
        item,
        score: calculateSimilarity(item.toLowerCase(), query)
    }));
    
    // Sort by score (highest first) and filter for minimum similarity
    return scoredResults
        .filter(result => result.score > 0.3)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(result => result.item);
}

/**
 * Calculate similarity between two strings (basic implementation)
 */
function calculateSimilarity(str1, str2) {
    // Exact match
    if (str1 === str2) return 1.0;
    
    // Contains match (weighted higher)
    if (str1.includes(str2)) return 0.9;
    if (str2.includes(str1)) return 0.8;
    
    // Check if string starts with query
    if (str1.startsWith(str2)) return 0.7;
    
    // Character-by-character comparison for edit distance
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    // Early exit if too different in length
    if (longer.length === 0) return 1.0;
    if (shorter.length === 0) return 0.0;
    
    // Simple matching (count characters in common)
    let matches = 0;
    for (let i = 0; i < shorter.length; i++) {
        if (longer.includes(shorter[i])) {
            matches++;
        }
    }
    
    return matches / longer.length;
}

/**
 * Display suggestions in the container
 */
function displaySuggestions(container, suggestions, inputElement, customSelectionHandler = null) {
    // Clear existing suggestions
    clearSuggestions(container);
    
    if (suggestions.length === 0) {
        container.classList.add('hidden');
        return;
    }
    
    // Create suggestion elements
    suggestions.forEach(suggestion => {
        const div = document.createElement('div');
        div.className = 'px-4 py-2 hover:bg-blue-50 cursor-pointer';
        div.textContent = suggestion;
        
        div.addEventListener('click', () => {
            if (customSelectionHandler) {
                customSelectionHandler(inputElement, suggestion);
            } else {
                inputElement.value = suggestion;
            }
            container.classList.add('hidden');
            
            // Trigger change event
            const event = new Event('change', { bubbles: true });
            inputElement.dispatchEvent(event);
        });
        
        container.appendChild(div);
    });
    
    // Show container
    container.classList.remove('hidden');
}

/**
 * Clear all suggestions from container
 */
function clearSuggestions(container) {
    container.innerHTML = '';
}

/**
 * Handle input focus events
 */
function handleInputFocusEvents(input, container) {
    // Close suggestions on blur
    input.addEventListener('blur', function(e) {
        // Small delay to allow for clicking on suggestions
        setTimeout(() => {
            container.classList.add('hidden');
        }, 200);
    });
    
    // Show suggestions on focus if has value
    input.addEventListener('focus', function() {
        const query = this.value.trim();
        if (query.length >= 2) {
            // Trigger input event to show suggestions
            const event = new Event('input', { bubbles: true });
            this.dispatchEvent(event);
        }
    });
}

/**
 * Show auto-correction if needed
 */
function showAutoCorrection(input, query) {
    // Get possible corrections for common spelling errors
    const corrections = getSpellingCorrections(query);
    
    // Show correction if found
    if (corrections.length > 0) {
        // Check if correction container already exists
        let correctionContainer = input.parentElement.querySelector('.correction-suggestion');
        if (!correctionContainer) {
            correctionContainer = document.createElement('div');
            correctionContainer.className = 'correction-suggestion text-sm text-blue-600 mt-1';
            input.insertAdjacentElement('afterend', correctionContainer);
        }
        
        // Add correction suggestion
        correctionContainer.innerHTML = `Did you mean: <a href="#" class="underline">${corrections[0]}</a>?`;
        
        // Add click handler for correction
        const correctionLink = correctionContainer.querySelector('a');
        correctionLink.addEventListener('click', function(e) {
            e.preventDefault();
            input.value = corrections[0];
            
            // Trigger change event
            const event = new Event('change', { bubbles: true });
            input.dispatchEvent(event);
            
            // Clear correction
            correctionContainer.innerHTML = '';
        });
    } else {
        // Remove any existing correction container
        const existingCorrection = input.parentElement.querySelector('.correction-suggestion');
        if (existingCorrection) {
            existingCorrection.innerHTML = '';
        }
    }
}

/**
 * Get spelling corrections for common errors
 */
function getSpellingCorrections(query) {
    // Early return for short queries
    if (query.length < 3) return [];
    
    // Check against all potential matches
    const allItems = [...EDUCATIONAL_DOMAINS, ...CAREER_PATHS];
    
    // Calculate edit distance for each item
    const potentialCorrections = allItems
        .map(item => ({
            item,
            distance: levenshteinDistance(query.toLowerCase(), item.toLowerCase())
        }))
        .filter(result => {
            // Filter based on length and edit distance
            const maxDistance = Math.floor(query.length / 3); // Allow 1 error per 3 characters
            return result.distance <= maxDistance && result.distance > 0; // Must have some difference
        })
        .sort((a, b) => a.distance - b.distance)
        .map(result => result.item);
    
    return potentialCorrections.slice(0, 1); // Only return top correction
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a, b) {
    const matrix = [];
    
    // Increment along the first column of each row
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    
    // Increment each column in the first row
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    
    // Fill in the rest of the matrix
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    matrix[i][j - 1] + 1,     // insertion
                    matrix[i - 1][j] + 1      // deletion
                );
            }
        }
    }
    
    return matrix[b.length][a.length];
}

/**
 * Debounce function to limit execution rate
 */
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

// Initialize smart suggestions when DOM is loaded
document.addEventListener('DOMContentLoaded', initSmartSuggestions);

// Add necessary styles to the document
const styleSheet = document.createElement('style');
styleSheet.textContent = `
.suggestion-container {
    transition: all 0.2s ease;
    z-index: 1000;
}
.suggestion-container div:hover {
    background-color: rgba(59, 130, 246, 0.1);
}
.correction-suggestion {
    font-style: italic;
}
`;
document.head.appendChild(styleSheet);