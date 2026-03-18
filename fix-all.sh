#!/bin/bash
# Run this in Git Bash from your zesty-erp folder
# Fixes laundry, tasks, and job orders nav in one go

cd ~/Desktop/Claude/zesty-erp

echo "=== Step 1: Restore clean laundry and tasks from git ==="
git show 1aae1e5:laundry.html > laundry.html
git show 1aae1e5:tasks.html > tasks.html
echo "Done"

echo "=== Step 2: Fix laundry - move to main Supabase ==="
sed -i 's|luwkxhmzlvotxycfigbd\.supabase\.co|whuytfjwdjjepayeiohj.supabase.co|g' laundry.html
sed -i 's|eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1d2t4aG16bHZvdHh5Y2ZpZ2JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA5MzA2MzUsImV4cCI6MjA1NjUwNjYzNX0\.hbo7mI8YHjALsApFMVAnCuuM1GYfFGYRHRjSwJa6Yjw|eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndodXl0Zmp3ZGpqZXBheWVpb2hqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyODQxMzQsImV4cCI6MjA4Nzg2MDEzNH0.pTDAqw_Cnzc9D3tJU-tU7Ch5qpapKmteiqI_ooSCufY|g' laundry.html
echo "Supabase URL updated in laundry"

echo "=== Step 3: Remove old header from laundry and tasks ==="
# Remove <header>...</header> block from laundry
perl -i -0pe 's/<header>.*?<\/header>/<!-- nav handled by erp-nav.js -->/s' laundry.html
perl -i -0pe 's/<header class[^>]*>.*?<\/header>/<!-- nav handled by erp-nav.js -->/s' laundry.html
echo "Old headers removed"

echo "=== Step 4: Add erp-nav.js to laundry and tasks ==="
# Remove any existing tags first
sed -i 's|<script src="erp-nav.js"></script>||g' laundry.html
sed -i 's|<script src="erp-nav.js"></script>||g' tasks.html
# Append at very end
echo '' >> laundry.html
echo '<script src="erp-nav.js"></script>' >> laundry.html
echo '' >> tasks.html
echo '<script src="erp-nav.js"></script>' >> tasks.html
echo "erp-nav.js tags added"

echo "=== Step 5: Fix jobs nav - restore from clean commit ==="
git show 1aae1e5:jobs.html > jobs_clean.html
# Remove old header from clean jobs
perl -i -0pe 's/<header[^>]*>.*?<\/header>/<!-- nav handled by erp-nav.js -->/s' jobs_clean.html
# Remove existing nav tags, append new one
sed -i 's|<script src="erp-nav.js"></script>||g' jobs_clean.html
echo '' >> jobs_clean.html
echo '<script src="erp-nav.js"></script>' >> jobs_clean.html
mv jobs_clean.html jobs.html
echo "jobs.html fixed"

echo "=== Step 6: Verify ==="
echo "laundry.html lines: $(wc -l < laundry.html)"
echo "tasks.html lines: $(wc -l < tasks.html)"
echo "jobs.html lines: $(wc -l < jobs.html)"
grep -c "whuytfjwdjjepayeiohj" laundry.html && echo "laundry Supabase: CORRECT"
grep -c "erp-nav.js" laundry.html && echo "laundry nav: OK"
grep -c "erp-nav.js" tasks.html && echo "tasks nav: OK"
grep -c "erp-nav.js" jobs.html && echo "jobs nav: OK"

echo "=== Step 7: Push to GitHub ==="
git add laundry.html tasks.html jobs.html
git commit -m "Fix laundry Supabase + restore tasks + fix jobs nav"
git push origin main

echo ""
echo "=== ALL DONE ==="
echo "Now upload laundry.html, tasks.html and jobs.html to WordPress"
echo "Also run the Supabase SQL for laundry_data table if not done yet"
