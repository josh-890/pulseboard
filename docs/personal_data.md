Here is the revised personal data schema formatted in clean **Markdown** for better readability:


# Personal Data Schema

## Once per Person
These are origin facts or congenital/permanent traits that rarely update. They form the core identity anchor.

### Database
- PID (automatic by Database)
- Common Name (required - the Name marked in the Alias with a star)
- ICG-ID (String - required)

### Names
- Real Name (Birth Name) - optional


### Origin
- Sex at birth (male, female)
- Date of birth
- Place of birth (city/region/country)
- Birth name (aka REAL Name / Legal Name - if given, this name should be marked soehow in the alias list too)
- Nationality (We choose from the List of country codes as in https://en.wikipedia.org/wiki/List_of_ISO_3166_country_codes) Shown is the the three letter Code (GER for Germany) and the respective flag. The imagae for the flag should be loaded from a reliable source in the WEB the first time we need it and then stored locally for further use)
- Ethnicity (choose from ethnicity.csv)

### Physical characteristics
- Eye color (natural), special characteristics (heterochromia, …)
- Natural hair color (base color)
- Height as adult
- special body characteristics, like Moles / freckles (from birth)
--> show with Media (photos)



## 2. MAINTAIN SEQUENTIALLY in PERSONAS (history)
Each person has at least ONE persona that is generated when a new person is added. It is the first by date added and marked as baseline. It can not be deleted. All other personas only show deifferential changes to earlier personas. The final actual state is the sequence of all personas. The final actual Status has to be shown on a persons detail page. 

Personas hold besides other information also personal data as follows. They have to be added when a new person is added to the baseline person.

All fields here support valid_from/to dates, events, assessments, or status changes.


### Physical characteristics
- Weight (in kg)
- Build / stature (choose from predefined sets)
- Current hair color (how exatly has to be defined)
- Vision aids (glasses / contact lenses) 
- Fitness level / body composition (e.g., BMI, muscle mass) 

### Body Characteristics (SMT: Scars / Marks / Tattoos)
Uniform object format per feature:
- Type (tattoo / scar / mark / burn / deformity / other)
- Body region + position + side
- Description, color(s), size
- Status (active / removed / faded / covered)
- valid_from/to (or created_at + ended_at)
- Moles / freckles (acquired)
--> show with Media (photos)

### Body Modifications (object-based)
- Piercings: set / removed / overgrown 
- Stretching, branding, scarification, implants 
- Teeth / jewelry mods – status + date
--> show with Media (photos)

### Surgical / Cosmetic Procedures 
- Procedure (type, body region)
- Details optional
--> show with Media (photos)

### Professional information, Competencies / Skills 
- Started to work in: Year
- Rerired in: year
- Age at Start (calculated as difference between date of birth and Started to work (in years)
- Status (Active, Retired, .....)
- Skill – Level – valid_from/to (or assessed_at)
- Skill evidence (projects) – Events
- Role-specific skills – link to org affiliation

### Education, Training, Certificates
- Educational stages (institution, period)
- Degrees / Certificates
- Continuing education (date)
- Awards / honors (context)

### Relationships (as a relationship with a time chain)
- Partner / marriage / separation / divorce – relationship + valid_from/to + event type
- Professional networks (e.g., mentors, collaborators) – valid_from/to + context

### Digital Identities & Access (always historicize)
- Online profiles (e.g., x, LinkedIn) – handles + status

### Preferences & Interests (always historicize)
- Hobbies / interests – valid_from/to + level
