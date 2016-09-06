# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import models, migrations


class Migration(migrations.Migration):

    dependencies = [
        ('chtscan', '0007_remove_assessment_taskid'),
    ]

    operations = [
        migrations.DeleteModel(
            name='request',
        ),
        migrations.RemoveField(
            model_name='vulnerability',
            name='assessmentid',
        ),
        migrations.DeleteModel(
            name='assessment',
        ),
        migrations.DeleteModel(
            name='vulnerability',
        ),
    ]
