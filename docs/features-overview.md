# Features Overview

> This document is the product roadmap/backlog for Momentum following its V1 build on 6/21/2026. Features have been added, adjusted, or reprioritized from `brainstorm-session-2026-05-15.md`, `Brainstorm_Features.docx`, and any other document. `Brainstorm_Features.docx` should be referenced for more detailed explanations for certain features.

---

## V1 Deferred — due 6/28

Take the unpolished V1 build to a usable, mostly functioning desktop app with entire V1 functionality.

- [ ] 1. Classification engine (allowed/disallowed lists global only, strict mode, classify() and not-sure data — ask claude how to best classify this, classify Windows home screen?)
    - [ ] Unproductive data overrides productive/not-sure data on multiple monitors (add an explanation for this in settings)
- [ ] 2. Feeling distracted popup trigger, windows notification/force app to front of screen, nudge text is hardcoded not live
    - [ ] Play around with timing of popup, view risk factors or procrastination log options, option to close popup
    - [ ] Have risk factors and procrastination log options take you to separate popup pages. Risk factors enables you to make a recurring task to help you make it a habit, task has risk factor category
- [ ] 3. Timer + notifications, 10-min for logs (countdown)
- [ ] 4. Settings screen is a placeholder, not functioning
    - [ ] Add settings for popup trigger in minutes, break-down mode (V3), strict mode, profile (V2)
- [ ] 5. Daily task carry-over to new day (only incomplete tasks), weekly list sql data review, update written-in tasks to have a popup page to set date/time, category, steps, reminders, Calendar view for daily/weekly, weekly carry-over (double check it follows daily carry-over)
    - [ ] Weekly default, daily or monthly views
- [ ] 6. Splash animation
- [ ] 7. Productivity Trends page is same as Current Session
    - [ ] Both pages aren't loading the sql data correctly (stuck at 1h 30m for a while)
    - [ ] Ensure SQL database is storing daily trends properly as accumulated data and deleting the rest
- [ ] 8. Verify that logs save and can be reviewed
- [ ] 9. Reduce clutter in log flow or resize the card (steps 3 and 4, review all steps and remove unnecessary steps)
- [ ] 10. Npm run dev: still prints active window to terminal (says "starting Electron", says Electron in active window print, right clicking taskbar icon says Electron as well)
    - [ ] Change this print to a "running Momentum app" or remove all print statements once you verify the sql window/url tracking is working properly
- [ ] 11. Remove all the excess eyebrow text (pages already show header + caption, eyebrow is redundant)
- [ ] 12. Make sure top right focused timer, "this session" timing card, "toward a break" card are all linked to the correct page
- [ ] 13. Review how polling works and how sql is stored
    - [ ] Review database question in "Polling Structure" tab with working polling/sql data to see which works best
- [ ] 14. Looks like momentum.exe is working now, verify and figure out why (Windows approved us??)
- [ ] 15. Verify that polling works properly: multiple windows, file explorer vs microsoft edge, minimized items, windows home shell, multiple monitors vs single laptop screen, test Edge (youtube) on half monitor split view
- [ ] 16. Npm audit warnings
- [ ] 17. Delete github branch or rename to new feature branch
- [ ] 18. Security check, crash/edge case testing (fable)
- [ ] 19. Add V1.0 note to splash screen

---

## V2 Features — due 7/5 (really 7/3)

Add necessary features to fill in final placeholders and make app cover all core functionality listed in Brainstorm_Features.docx.

- [ ] 1. Pomodoro Timer break notifier, user specified timer amounts, pomodoro time adjustment setting
    - [ ] These should auto fire. Mode for standard countdown and strict-mode (productive data only)
    - [ ] Default is pomodoro auto fires every 50 mins, user specified time overrides this, option to turn off
    - [ ] Slider to make pomodoro/user specified reoccurring or one-time, consider default breaks
    - [ ] Break popup "Nice work. Take a healthy break for 10 minutes, such as a walk around the block (no music), stretching, getting water or a healthy snack, getting fresh air and sunshine, chatting with a friend, a gratitude journal, or breathing/meditating. Visualize what you have accomplished and what you will do during this time."
- [ ] 2. Current session "live" card (restore or delete)
- [ ] 3. Create Profile page or about me page, replace risk factors page with this, make it a tab in profile page
- [ ] 4. Ensure app is tied to computer's local timezone, add a timezone setting page with manual override
- [ ] 5. Login in popup page (welcome, create profile, new lists for the week, add daily tasks)
    - [ ] Verify first launch of day, week (Monday's) are working with new profile setup
    - [ ] Weekly list is default popup to force user to think about entire week, then select daily items from weekly list and push unessential items to next week (specific day or Monday default), showing a review for the current day
- [ ] 6. Step breakdown walkthrough popup similar to Lyra activity. Can be extra page in new task popup page
- [ ] 7. Drag to reorder tasks/steps
- [ ] 8. Verify changing task/step date or time reorders daily/calendar task view
- [ ] 9. Completed work is saved to calendar tab
    - [ ] Option to show only completed items, hide other items
    - [ ] Option to show only outstanding items, hide completed items
    - [ ] Carried over tasks show original date added or started, original due date
- [ ] 10. Productivity trends has full calendar view, not just current week, add more charts/visuals
- [ ] 11. Add V1.2 note to splash

---

## V3 Features — due 7/12

Add the last features to cover full functionality of Brainstorm_Features.docx. This is a completed app, and would be a great stopping point for balancing moving and interviews.

- [ ] 1. Reflection informational page: dopamine/avoidance/productivity advice page (add best practices articles, ie phone out of sight)
    - [ ] Frequent interventions take you to this page
    - [ ] Add pomodoro/breaks research source, hyperlink this to timer popups
    - [ ] Healthy break suggestions (brainstorm.docx), add to popups
    - [ ] Back up other claims in prompts with evidence. "studies show that X is effective" + hyperlink
- [ ] 2. Profile: What are a few things that lock you into your work? Music recs (playlists/sets > 1hr long), standing desk, public setting, etc
    - [ ] What detracts you from focus? Is your phone in a different room? Did you leave it in the car (if safe)?
    - [ ] Popups reference these items
- [ ] 3. Journal page: thought records, strong emotions, gratitude logs
- [ ] 4. Claude API
    - [ ] Review LLM integrations in brainstorm-session.md
- [ ] 5. Add breakdown steps auto feature with Claude API to list all total steps needed to complete a task/goal
    - [ ] List only first 3 steps, big list is expandable
    - [ ] Play around with original first — might be more helpful to go through the process yourself, although Claude is good for unfamiliar tasks
- [ ] 6. Goal Tracking page: input hours spent towards goals, compare that with computer time (productive vs unproductive), phone time (see if you can pull from Apple API, or ask user to check/input their daily screentime), chores time
    - [ ] Short/long term options, milestones, reminders
- [ ] 7. Global vs local allowed/disallowed lists per task
- [ ] 8. Efficiency stats/trends based on task started vs task completed timestamps — in Productivity Trends page
- [ ] 9. Task list auto-organized by category (buttons show only work, only personal, only hobby, only goal, risk factor habit tasks)

---

## V4 Features — due 8/9

Nice to have features that aren't listed in the brainstorm doc or necessary for core app functionality. Finish before car-week, CDA, and new job/moving.

- [ ] 1. Mac release, cross-browser support for Safari, Chrome, Firefox
- [ ] 2. Smart App Control code signing, Windows/Mac packaging (license if smart app control workaround from gemini doesn't work)
    - [ ] Windows smart app control allow app — Google Search
- [ ] 3. "Help me get started" button for tasks
- [ ] 4. Feature to pull in sleep data from Garmin
- [ ] 5. Pull screentime data from iPhone (see if there is a timestamp for phone screentime data to adjust computer productive/unproductive/not-sure data to unproductive data)
- [ ] 6. Claude API uses risk factor information, sleep, goal, phone screentime data to deliver personalized popups/nudges
- [ ] 7. End of day/week debrief (similar to lets-go-home), after Claude integration. Include skippable options
- [ ] 8. Framer Motion animations
- [ ] 9. App usage data: streak, total days, consecutive days, monthly totals
- [ ] 10. Task list (daily + steps, calendar) auto-populates after Claude scans email inbox
- [ ] 11. Deadlines feature — Claude auto-populates milestones into your calendar when you input large future deadlines

---

## V5 Features

Do not complete until after starting new job.

- [ ] 1. Installer + auto-updater Mac and Windows
- [ ] 2. Windows/Mac app store release or distribution packaging
- [ ] 3. Bug testing, security bulletproofing, RAM/CPU performance (short and long term use), Chromium package size
- [ ] 4. AutomationId resilience (auto-diagnostic for Edge UI changes)
- [ ] 5. "Hardcore mode" (call me out on my bullshit, be completely honest with what I need to change and give me steps to get there)

---

## V6 Features

Long term ideas.

- [ ] 1. Phone app — syncs with computer(s) for non-work activity
- [ ] 2. Habit tracking — see Brainstorm_Features.docx for more information
- [ ] 3. Data transparency page: "How your data is being used"
- [ ] 4. Voice control (phone and computer)
- [ ] 5. Emotions trend tracking through logs data or daily/weekly surveys, similar to Lyra
- [ ] 6. Life Coach AI Agent
- [ ] 7. Website hard-blocking integration (Freedom / Cold Turkey partnership)
    - [ ] Momentum saves the password (multiple copies in browser extension version), or gives you random password for Block Sites extension and saves copies
- [ ] 8. Meditation features
- [ ] 9. CBT Center
- [ ] 10. Milestoning with enforced consequences (e.g. auto-donate to charity on missed deadline)
- [ ] 11. Partnership with therapy services (e.g. Lyra Health) to prompt users to get help if their data is trending down
- [ ] 12. "Stop Momentum" mode for intentional personal time
- [ ] 13. Doomscrolling/gaming detection
    - [ ] Suggest joining activities for parents or couples where someone has computer addiction
